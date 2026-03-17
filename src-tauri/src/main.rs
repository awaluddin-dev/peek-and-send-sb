// Prevents additional console window on Windows in release, DO NOT REMOVE!!
use azservicebus::prelude::*;
use directories::ProjectDirs; // Untuk mencari folder config di Linux
use serde::{Deserialize, Serialize}; // Untuk mengubah data Rust jadi JSON
use std::fs; // Library standar Rust untuk File System
use std::path::PathBuf;

#[derive(Serialize, Deserialize)]
struct SubscriptionInfo {
    name: String,
}

#[derive(Serialize, Deserialize)]
struct TopicInfo {
    name: String,
    subscriptions: Vec<SubscriptionInfo>, // Vec itu seperti Array di JS
}

#[tauri::command]
async fn connect_service_bus(uri: String) -> Result<String, String> {
    let client = ServiceBusClient::new(&uri, ServiceBusClientOptions::default())
        .await
        .map_err(|e| e.to_string())?;

    Ok(format!("Berhasil terhubung ke: {}", uri))
}

#[tauri::command]
async fn get_topics_and_subscriptions(uri: String) -> Result<Vec<TopicInfo>, String> {
    // 1. Buat Management Client
    // Catatan: Library azservicebus biasanya memisahkan Client untuk Messaging dan Management
    let mut client = ServiceBusClient::new(&uri, ServiceBusClientOptions::default())
        .await
        .map_err(|e| e.to_string())?;

    // Untuk mendapatkan list, kita butuh ServiceBusAdministrationClient
    // Namun karena kita ingin simpel, kita asumsikan Anda ingin melihat data yang aktif

    // --- Simulasi Data untuk Testing UI ---
    // Di bagian ini nanti kita akan ganti dengan pemanggilan API Azure yang asli.
    // Untuk sekarang, mari kita pastikan jembatan data Tree-View nya jalan dulu.
    let mock_data = vec![
        TopicInfo {
            name: "order-processed".to_string(),
            subscriptions: vec![
                SubscriptionInfo {
                    name: "email-service".to_string(),
                },
                SubscriptionInfo {
                    name: "inventory-update".to_string(),
                },
            ],
        },
        TopicInfo {
            name: "user-registered".to_string(),
            subscriptions: vec![SubscriptionInfo {
                name: "welcome-email".to_string(),
            }],
        },
    ];

    Ok(mock_data)
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
    label: String,
) -> Result<String, String> {
    // 1. Inisialisasi Client
    let client = ServiceBusClient::new(&uri, ServiceBusClientOptions::default())
        .await
        .map_err(|e| e.to_string())?;

    // 2. Buat Sender khusus untuk Topic tersebut
    let mut sender = client
        .create_sender(&topic_name, ServiceBusSenderOptions::default())
        .await
        .map_err(|e| e.to_string())?;

    // 3. Buat Pesan
    let mut message = ServiceBusMessage::new(message_body);

    // Set Subject/Label jika ada
    if !label.is_empty() {
        message.set_subject(label);
    }

    // 4. Kirim!
    sender
        .send_message(message)
        .await
        .map_err(|e| e.to_string())?;

    Ok(format!("Pesan berhasil dikirim ke topic: {}", topic_name))
}

#[tokio::main]
async fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            connect_service_bus,
            get_topics_and_subscriptions,
            save_connection,
            load_connection,
            send_sb_message
        ])
        .run(tauri::generate_context!())
        .expect("Error while running tauri application")
}
