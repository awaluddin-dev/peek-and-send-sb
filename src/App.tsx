import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

interface Subscription {
  name: string;
}

interface Topic {
  name: string;
  subscriptions: Subscription[];
}

function App() {
  const [uri, setUri] = useState("");
  const [status, setStatus] = useState("");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
const [payload, setPayload] = useState('{\n  "key": "value"\n}');
const [label, setLabel] = useState("");

  useEffect(() => {
    async function loadSavedUri() {
      try {
        const savedUri = await invoke<string>("load_connection");
        if (savedUri) setUri(savedUri);
      } catch (err) {
        console.error("Gagal memuat config:", err);
      }
    }
    loadSavedUri();
  }, []);

async function handleConnect() {
    setLoading(true);
    try {
      // 1. Simpan dulu ke file lokal lewat Rust
      await invoke("save_connection", { uri });
      
      // 2. Lanjut proses koneksi seperti biasa
      await invoke("connect_service_bus", { uri });
      const data = await invoke<Topic[]>("get_topics_and_subscriptions", { uri });
      setTopics(data);
      setStatus("Connected & Saved!");
    } catch (error) {
      setStatus("Error: " + error);
    } finally {
      setLoading(false);
    }
  }
  async function handleSendMessage() {
  if (!selectedTopic) return;
  setLoading(true);
  try {
    const res = await invoke<string>("send_sb_message", {
      uri,
      topicName: selectedTopic,
      messageBody: payload,
      label
    });
    alert(res); // Nanti bisa diganti dengan toast notification yang lebih cantik
  } catch (err) {
    alert("Gagal kirim: " + err);
  } finally {
    setLoading(false);
  }
}

  return (
    <div className="container">
      <aside className="sidebar">
        <h2>SB Explorer</h2>
        <div className="connection-form">
          <input
            value={uri}
            onChange={(e) => setUri(e.currentTarget.value)}
            placeholder="Endpoint=sb://..."
          />
          <button onClick={handleConnect} disabled={loading}>
            {loading ? "..." : "Connect"}
          </button>
        </div>
        <p className="status-text">{status}</p>

        <hr />

        <div className="topic-list">
          {topics.map((topic) => (
            <details key={topic.name} className="topic-item">
              <summary>📁 {topic.name}</summary>
              <div className="subscription-list">
                {topic.subscriptions.map((sub) => (
                  <details key={sub.name} className="sub-item">
                    <summary>📩 {sub.name}</summary>
                    <div className="actions">
                      <button className="btn-peek">Peek</button>
                      <button className="btn-purge">Purge</button>
                      <button className="btn-dlq">DLQ</button>
                    </div>
                  </details>
                ))}
              </div>
              <button className="btn-send">+ Send Message</button>
            </details>
          ))}
        </div>
      </aside>

      <main className="content">
  {selectedTopic ? (
    <div className="send-form">
      <h3>Send Message to: <span className="highlight">{selectedTopic}</span></h3>
      
      <div className="input-group">
        <label>Label / Subject</label>
        <input 
          value={label} 
          onChange={(e) => setLabel(e.currentTarget.value)} 
          placeholder="e.g. OrderCreated"
        />
      </div>

      <div className="input-group">
        <label>JSON Payload</label>
        <textarea
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
          rows={15}
          spellCheck={false}
          className="json-editor"
        />
      </div>

      <button className="btn-send-execute" onClick={handleSendMessage} disabled={loading}>
        {loading ? "Sending..." : "🚀 Send Message Now"}
      </button>
    </div>
  ) : (
    <div className="placeholder">
      Silakan klik tombol <b>+ Send Message</b> di sidebar untuk mulai mengirim pesan.
    </div>
  )}
</main>
    </div>
  );
}

export default App;