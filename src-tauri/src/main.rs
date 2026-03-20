// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use azservicebus::prelude::*;
use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use base64::{engine::general_purpose, Engine as _};
use urlencoding::encode;

#[derive(Serialize, Deserialize)]
struct SubscriptionInfo {
    name: String,
    active_count: i32,
    dead_letter_count: i32,
    scheduled_count: i32,
}

#[derive(Serialize, Deserialize)]
struct TopicInfo {
    name: String,
    subscriptions: Vec<SubscriptionInfo>,
}

// Helper untuk parsing Connection String
struct ConnectionDetails {
    endpoint: String,
    key_name: String,
    key_value: String,
    namespace: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct SbMessage {
    body: String,
    message_id: String,
    sequence_number: i64,
    enqueued_time: String, // Kita format jadi string ISO
    subject: String,
    // Properti custom (Application Properties)
    properties: std::collections::HashMap<String, String>,
}

fn parse_connection_string(uri: &str) -> Result<ConnectionDetails, String> {
    let parts: std::collections::HashMap<_, _> = uri
        .split(';')
        .filter_map(|s| s.split_once('='))
        .collect();

    let endpoint = parts.get("Endpoint").ok_or("No Endpoint")?.to_string();
    let key_name = parts.get("SharedAccessKeyName").ok_or("No Key Name")?.to_string();
    let key_value = parts.get("SharedAccessKey").ok_or("No Key Value")?.to_string();
    
    // Ambil namespace dari endpoint (sb://namespace.servicebus.windows.net/)
    let namespace = endpoint
        .replace("sb://", "")
        .split('.')
        .next()
        .ok_or("Invalid Namespace")?
        .to_string();

    Ok(ConnectionDetails {
        endpoint: endpoint.replace("sb://", "https://"),
        key_name,
        key_value,
        namespace,
    })
}

// Fungsi untuk membuat SAS Token (Wajib untuk REST API Azure)
fn generate_sas_token(resource_uri: &str, key_name: &str, key_value: &str) -> String {
    let expiry = (SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() + 3600)
        .to_string();

    let string_to_sign = format!("{}\n{}", encode(resource_uri), expiry);
    
    type HmacSha256 = Hmac<Sha256>;
    let mut mac = HmacSha256::new_from_slice(key_value.as_bytes()).expect("HMAC error");
    mac.update(string_to_sign.as_bytes());
    
    let signature = general_purpose::STANDARD.encode(mac.finalize().into_bytes());
    
    format!(
        "SharedAccessSignature sr={}&sig={}&se={}&skn={}",
        encode(resource_uri),
        encode(&signature),
        expiry,
        key_name
    )
}

#[tauri::command]
async fn connect_service_bus(uri: String) -> Result<String, String> {
    let _client = ServiceBusClient::new_from_connection_string(&uri, ServiceBusClientOptions::default())
        .await
        .map_err(|e| e.to_string())?;
    Ok("Koneksi Valid".to_string())
}

#[tauri::command]
async fn get_topics_and_subscriptions(uri: String) -> Result<Vec<TopicInfo>, String> {
    println!("Memulai fetch metadata..."); 
    let details = parse_connection_string(&uri)?;
    let client = reqwest::Client::new();
    
    let url = format!("{}$resources/topics?api-version=2017-04", details.endpoint);
    let token = generate_sas_token(&details.endpoint, &details.key_name, &details.key_value);

    println!("Requesting Topics to: {}", url);

    let res = client.get(&url)
        .header("Authorization", &token)
        .send()
        .await
        .map_err(|e| format!("Request Error: {}", e))?
        .text()
        .await
        .map_err(|e| format!("Body Error: {}", e))?;

    if res.contains("<Error>") {
        return Err(format!("Azure API Error: {}", res));
    }

    let mut topics = Vec::new();
    let re_topic = regex::Regex::new(r"<title[^>]*>(.*?)</title>").unwrap();
    
    for cap in re_topic.captures_iter(&res) {
        let topic_name = &cap[1];
        if topic_name == details.namespace || topic_name == "Topics" || topic_name == "feed" { 
            continue; 
        }

        println!("Mencari Subs untuk Topic: {}", topic_name);

        let base_url = details.endpoint.trim_end_matches('/');
        let sub_url = format!("{}/{}/subscriptions?api-version=2017-04", base_url, topic_name);
        
        let sub_res = client.get(&sub_url)
            .header("Authorization", &token)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .text()
            .await
            .map_err(|e| e.to_string())?;

        let mut subs = Vec::new();
        
        let re_entry = regex::Regex::new(r"(?s)<entry[^>]*>(.*?)</entry>").unwrap();
        
        let re_active = regex::Regex::new(r"ActiveMessageCount>(.*?)</").unwrap();
        let re_dead = regex::Regex::new(r"DeadLetterMessageCount>(.*?)</").unwrap();
        let re_scheduled = regex::Regex::new(r"ScheduledMessageCount>(.*?)</").unwrap();

        // Lakukan looping pada setiap potongan <entry>
        for entry_cap in re_entry.captures_iter(&sub_res) {
            // Gunakan entry_cap[0] untuk mengambil keseluruhan teks beserta tag-nya
            let entry_xml = &entry_cap[0]; 
            
            // Cari nama subscription DI DALAM entry_xml ini
            if let Some(sub_cap) = re_topic.captures(entry_xml) {
                let sub_name = &sub_cap[1];
                
                if sub_name != topic_name && sub_name != "Subscriptions" && sub_name != "feed" && !sub_name.contains('/') {
                    
                    // Ekstrak angka DI DALAM entry_xml ini
                    let active: i32 = re_active.captures(entry_xml)
                        .and_then(|c| c.get(1))
                        .map_or(0, |m| m.as_str().parse().unwrap_or(0));
                    
                    let dead: i32 = re_dead.captures(entry_xml)
                        .and_then(|c| c.get(1))
                        .map_or(0, |m| m.as_str().parse().unwrap_or(0));

                    let scheduled: i32 = re_scheduled.captures(entry_xml)
                        .and_then(|c| c.get(1))
                        .map_or(0, |m| m.as_str().parse().unwrap_or(0));

                    subs.push(SubscriptionInfo { 
                        name: sub_name.to_string(),
                        active_count: active,
                        dead_letter_count: dead,
                        scheduled_count: scheduled,
                    });
                }
            }
        }
        topics.push(TopicInfo {
            name: topic_name.to_string(),
            subscriptions: subs,
        });
    }

    if topics.is_empty() {
        println!("XML Response dari Azure: {}", res); 
        return Err("Tidak ada topic yang ditemukan. Pastikan Connection String memiliki akses Manage.".to_string());
    }

    Ok(topics)
}

fn get_config_path() -> PathBuf {
    if let Some(proj_dirs) = ProjectDirs::from("com", "servicebus", "explorer") {
        let config_dir = proj_dirs.config_dir();
        // Buat foldernya jika belum ada
        fs::create_dir_all(config_dir).ok();
        return config_dir.join("config.json");
    }
    PathBuf::from("config.json")
}

#[tauri::command]
fn save_connection(uri: String) -> Result<(), String> {
    let path = get_config_path();
    // Simpan String langsung ke file
    fs::write(path, uri).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn load_connection() -> Result<String, String> {
    let path = get_config_path();
    if path.exists() {
        let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
        return Ok(content);
    }
    Ok("".to_string()) // Jika belum ada file, balikkan teks kosong
}

#[tauri::command]
async fn send_sb_message(
    uri: String,
    topic_name: String,
    message_body: String,
    subject: String, 
    custom_properties: std::collections::HashMap<String, String>, 
) -> Result<String, String> {
    let mut client = ServiceBusClient::new_from_connection_string(&uri, ServiceBusClientOptions::default())
        .await
        .map_err(|e| e.to_string())?;

    let mut sender = client
        .create_sender(&topic_name, ServiceBusSenderOptions::default())
        .await
        .map_err(|e| e.to_string())?;

    let mut message = ServiceBusMessage::new(message_body);

    // 1. Isi System Property (sys.Subject)
    if !subject.is_empty() {
        message.set_subject(subject);
    }

    // 2. Isi Application Properties (Custom Properties untuk SqlFilter)
    // --- PERBAIKAN DI SINI ---
    if !custom_properties.is_empty() {
        // Ambil referensi mutabel dari properties, buat baru (Default) jika masih kosong (None)
        let props = message
            .application_properties_mut()
            .get_or_insert_with(Default::default);

        for (key, value) in custom_properties {
            // Gunakan .0 untuk memasukkan data ke dalam Map asli (BTreeMap) milik fe2o3
            props.0.insert(key, value.into());
        }
    }

    sender.send_message(message).await.map_err(|e| e.to_string())?;

    sender.dispose().await.map_err(|e| e.to_string())?;
    client.dispose().await.map_err(|e| e.to_string())?;

    Ok(format!("Pesan berhasil dikirim ke topic: {}", topic_name))
}

#[tauri::command]
async fn peek_messages(
    uri: String,
    topic: String,
    sub: String,
    is_dlq: bool,
    max_messages: u32,
) -> Result<Vec<SbMessage>, String> { // <--- UBAH RETURN TYPE
    let mut client = ServiceBusClient::new_from_connection_string(&uri, ServiceBusClientOptions::default())
        .await
        .map_err(|e| e.to_string())?;

    let mut receiver_options = ServiceBusReceiverOptions::default();
    if is_dlq {
        receiver_options.sub_queue = SubQueue::DeadLetter;
    }

    let mut receiver = client
        .create_receiver_for_subscription(&topic, &sub, receiver_options)
        .await
        .map_err(|e| e.to_string())?;

    let messages = receiver
        .peek_messages(max_messages, None)
        .await
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for msg in messages {
        // 1. Ekstrak Body
        let body_bytes = msg.body().map_err(|e| e.to_string())?;
        let body = String::from_utf8_lossy(body_bytes).to_string();

        // 2. Ekstrak Application Properties (Custom Properties)
        let mut app_props = std::collections::HashMap::new();
        if let Some(props) = msg.application_properties() {
            for (key, value) in &props.0 {
                let val_str = format!("{:?}", value).trim_matches('"').to_string();
                app_props.insert(key.clone(), val_str);
            }
        }

        result.push(SbMessage {
            body,
            message_id: msg.message_id().map(|id| id.to_string()).unwrap_or_default(), 
            sequence_number: msg.sequence_number(), 
            
            // PERBAIKAN KUNCI: Langsung format nilainya karena ia bukan Option!
            // Kita gunakan replace() agar tampilannya tetap bersih dari teks "Some(" jika library tiba-tiba update
            enqueued_time: format!("{:?}", msg.enqueued_time())
                .replace("Some(", "")
                .replace(")", ""),
            
            subject: msg.subject().map(|s| s.to_string()).unwrap_or_default(),
            properties: app_props,
        });
    }

    receiver.dispose().await.ok();
    client.dispose().await.ok();
    Ok(result)
}

#[tauri::command]
async fn purge_messages(uri: String, topic: String, sub: String) -> Result<String, String> {
    let mut client = ServiceBusClient::new_from_connection_string(&uri, ServiceBusClientOptions::default())
        .await
        .map_err(|e| e.to_string())?;

    let mut receiver = client
        .create_receiver_for_subscription(&topic, &sub, ServiceBusReceiverOptions::default())
        .await
        .map_err(|e| e.to_string())?;

    let mut count = 0;
    // Receive and delete dalam loop sampai habis (atau maksimal 50 untuk keamanan)
    while let Ok(messages) = receiver.receive_messages(10).await {
        if messages.is_empty() || count > 50 { break; }
        for msg in messages {
            receiver.complete_message(&msg).await.ok();
            count += 1;
        }
    }

    receiver.dispose().await.ok();
    client.dispose().await.ok();
    Ok(format!("Berhasil menghapus {} pesan", count))
}

#[tokio::main]
async fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            connect_service_bus,
            get_topics_and_subscriptions,
            save_connection,
            load_connection,
            send_sb_message,
            peek_messages,
            purge_messages
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
