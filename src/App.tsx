import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

interface Subscription {
  name: string;
  active_count: number;
  dead_letter_count: number;
  scheduled_count: number;
}

interface Topic {
  name: string;
  subscriptions: Subscription[];
}

interface ServiceBusMessage {
  body: string;
  message_id: string;
  sequence_number: number;
  enqueued_time: string;
  subject: string;
  properties: Record<string, string>;
}

function App() {
  const [uri, setUri] = useState("");
  const [status, setStatus] = useState("");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(false);
  const [logMessage, setLogMessage] = useState("Ready");
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [payload, setPayload] = useState('{\n  "key": "value"\n}');
  const [label, setLabel] = useState("");
  const [messages, setMessages] = useState<ServiceBusMessage[]>([]);
  const [fetchCount, setFetchCount] = useState<number>(20);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(
    new Set(),
  );
  const [selectedMessage, setSelectedMessage] =
    useState<ServiceBusMessage | null>(null);
  const [detailWidth, setDetailWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);
  const [detailWidthLeft, setDetailWidthLeft] = useState(400);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [customPropsStr, setCustomPropsStr] = useState(
    '{\n  "label": "tes"\n}',
  );

  const pageSize = 10;

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

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      // Hitung lebar baru: Lebar layar total dikurangi posisi X mouse saat ini
      const newWidth = window.innerWidth - e.clientX;

      // Batasi agar tidak terlalu kecil atau terlalu lebar (min 250px, max 800px)
      if (newWidth > 250 && newWidth < 800) {
        setDetailWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    // Jika sedang di-drag, pasang listener ke seluruh window agar geseran mulus
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      // Ubah kursor seluruh body menjadi panah geser
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none"; // Cegah teks tersorot saat menggeser
    } else {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "default";
      document.body.style.userSelect = "auto";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingLeft) return;

      const newWidth = e.clientX;

      if (newWidth > 250 && newWidth < 500) {
        setDetailWidthLeft(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizingLeft(false);
    };

    // Jika sedang di-drag, pasang listener ke seluruh window agar geseran mulus
    if (isResizingLeft) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      // Ubah kursor seluruh body menjadi panah geser
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none"; // Cegah teks tersorot saat menggeser
    } else {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "default";
      document.body.style.userSelect = "auto";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingLeft]);

  const toggleExpand = (messageId: string) => {
    setExpandedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  async function handleConnect() {
    setLoading(true);
    try {
      setLogMessage("Menyimpan koneksi...");
      await invoke("save_connection", { uri });

      setLogMessage("Menghubungkan ke Azure Service Bus...");
      await invoke("connect_service_bus", { uri });

      setLogMessage("Mengambil data Topics & Subscriptions...");
      const data = await invoke<Topic[]>("get_topics_and_subscriptions", {
        uri,
      });

      setTopics(data);
      setStatus("Connected");
      setLogMessage(`Sukses! Dimuat ${data.length} topics.`);
    } catch (error) {
      setStatus("Error");
      setLogMessage(`Error: ${error}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleSendMessage() {
    if (!selectedTopic) return;
    setLoading(true);
    setLogMessage(`Mengirim pesan ke ${selectedTopic}...`);

    // Parsing JSON Custom Properties
    let parsedProps = {};
    if (customPropsStr.trim() !== "") {
      try {
        parsedProps = JSON.parse(customPropsStr);
      } catch (e) {
        alert("Format Custom Properties harus berupa JSON yang valid!");
        setLoading(false);
        return;
      }
    }

    try {
      const result = await invoke<string>("send_sb_message", {
        uri,
        topicName: selectedTopic,
        messageBody: payload,
        subject: label, // Ini untuk sys.Subject
        customProperties: parsedProps, // Ini untuk routing SqlFilter
      });
      setLogMessage(result);
      alert("Pesan Berhasil Terkirim!");
    } catch (err) {
      setLogMessage(`Gagal mengirim: ${err}`);
      alert(err);
    } finally {
      setLoading(false);
    }
  }

  async function handlePeek(topic: string, sub: string, dlq: boolean = false) {
    setLoading(true);
    setLogMessage(`Mengambil maksimal ${fetchCount} pesan dari ${sub}...`);
    try {
      // PERBAIKAN 1: Ubah <string[]> menjadi <ServiceBusMessage[]>
      const data = await invoke<ServiceBusMessage[]>("peek_messages", {
        uri,
        topic,
        sub,
        isDlq: dlq,
        maxMessages: fetchCount,
      });
      setMessages(data);
      setCurrentPage(1);
      setExpandedMessages(new Set()); // Reset expand state
      setSelectedMessage(null); // Reset selected state
      setSelectedTopic(null);
      setLogMessage(`Berhasil melihat ${data.length} pesan.`);
    } catch (err) {
      setLogMessage(`Gagal peek: ${err}`);
      alert(err);
    } finally {
      setLoading(false);
    }
  }

  const renderMessageBody = (rawBody: string) => {
    try {
      const parsed = JSON.parse(rawBody);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return rawBody;
    }
  };

  const renderMessageViewer = () => {
    // PERBAIKAN 2: Kalkulasi ini cukup ditaruh di dalam fungsi render saja
    const totalPages = Math.ceil(messages.length / pageSize);
    const currentMessages = messages.slice(
      (currentPage - 1) * pageSize,
      currentPage * pageSize,
    );

    return (
      <div className="message-viewer master-detail-layout">
        {/* PANEL KIRI: LIST KARTU (MASTER) */}
        <div className="master-list-pane">
          <div className="viewer-header">
            <h3>Peek ({messages.length})</h3>
            <div className="viewer-controls">
              {/* PERBAIKAN 3: Kembalikan fitur Dropdown Fetch Config & Clear */}
              <label style={{ fontSize: "12px" }}>Fetch Max:</label>
              <select
                value={fetchCount}
                onChange={(e) => setFetchCount(Number(e.target.value))}
                className="select-list"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <button
                className="btn-clear btn-sm"
                onClick={() => setMessages([])}
              >
                X
              </button>
            </div>
          </div>

          <div className="card-list">
            {currentMessages.map((msg, i) => {
              const actualIndex = (currentPage - 1) * pageSize + i + 1;
              const isExpanded = expandedMessages.has(msg.message_id);
              const isSelected = selectedMessage?.message_id === msg.message_id;

              return (
                <div
                  key={msg.message_id}
                  className={`message-card ${isSelected ? "selected" : ""}`}
                  onClick={() => setSelectedMessage(msg)}
                >
                  <div className="card-header">
                    <div className="header-left">
                      <span className="msg-index">
                        Index #{actualIndex} (Seq: {msg.sequence_number}) -{" "}
                        {msg.enqueued_time}
                      </span>
                      {msg.subject && (
                        <span className="msg-subject">{msg.subject}</span>
                      )}
                    </div>
                    <div className="card-actions">
                      <button
                        className="btn-icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(msg.message_id);
                        }}
                      >
                        {isExpanded ? "🔼" : "🔽"}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <pre className="message-body mini-body">
                      {renderMessageBody(msg.body)}
                    </pre>
                  )}

                  {!isExpanded && (
                    <div className="body-preview">
                      {msg.body.substring(0, 100)}
                      {msg.body.length > 100 ? "..." : ""}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* PERBAIKAN 4: Kembalikan UI Pagination */}
          {totalPages > 1 && (
            <div className="pagination">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => p - 1)}
              >
                &laquo; Prev
              </button>
              <span style={{ fontSize: "12px" }}>
                Hal {currentPage} / {totalPages}
              </span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
              >
                Next &raquo;
              </button>
            </div>
          )}
        </div>

        {selectedMessage && (
          <div
            className={`panel-resizer ${isResizing ? "resizing" : ""}`}
            onMouseDown={() => setIsResizing(true)}
          />
        )}
        {/* PANEL KANAN: DETAIL HEADERS (DETAIL) */}
        {selectedMessage && (
          <aside className="detail-pane" style={{ width: `${detailWidth}px` }}>
            <div className="detail-header">
              <h4>System Properties</h4>
              <button
                className="btn-clear btn-sm"
                onClick={() => setSelectedMessage(null)}
              >
                X
              </button>
            </div>

            <table className="properties-table">
              <tbody>
                <tr>
                  <td>Message ID</td>
                  <td>
                    <code>{selectedMessage.message_id}</code>
                  </td>
                </tr>
                <tr>
                  <td>Sequence #</td>
                  <td>{selectedMessage.sequence_number}</td>
                </tr>
                <tr>
                  <td>Enqueued Time</td>
                  <td>{selectedMessage.enqueued_time}</td>
                </tr>
                {selectedMessage.subject && (
                  <tr>
                    <td>Subject</td>
                    <td>{selectedMessage.subject}</td>
                  </tr>
                )}
              </tbody>
            </table>

            {Object.keys(selectedMessage.properties).length > 0 && (
              <>
                <h4>Application Properties</h4>
                <table className="properties-table props-custom">
                  <tbody>
                    {Object.entries(selectedMessage.properties).map(
                      ([key, value]) => (
                        <tr key={key}>
                          <td>{key}</td>
                          <td>{value}</td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </>
            )}

            <h4>Full Body JSON</h4>
            <pre className="message-body detail-body">
              {renderMessageBody(selectedMessage.body)}
            </pre>
          </aside>
        )}
      </div>
    );
  };

  function handleDisconnect() {
    setTopics([]);
    setMessages([]);
    setSelectedTopic(null);
    setSelectedMessage(null);
    setStatus("");
    setLogMessage(
      "Terputus dari Azure Service Bus. Siap menerima koneksi baru.",
    );
  }

  return (
    <div className="app-wrapper">
      <div className="container">
        <aside className="sidebar" style={{ width: `${detailWidthLeft}px` }}>
          <h2>Service Bus Explorer</h2>
          {status === "Connected" ? (
            <div className="connection-form">
              <button
                className="btn-clear"
                onClick={handleDisconnect}
                style={{ width: "100%", fontWeight: "bold" }}
              >
                🔌 Disconnect
              </button>
            </div>
          ) : (
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
          )}

          {/* Status text tetap kita biarkan di bawahnya jika ingin melihat error/loading info */}
          <p className="status-text">
            {status === "Connected" ? "Terhubung ke Service Bus" : status}
          </p>

          <hr
            style={{
              height: "2px",
              width: "100%",
              margin: "0px",
              padding: "0px",
            }}
          />

          <div className="topic-list">
            {topics.map((topic) => (
              <details key={topic.name} className="topic-item">
                <summary>📁 {topic.name}</summary>
                <div className="subscription-list">
                  {topic.subscriptions.length === 0 && (
                    <span style={{ fontSize: "10px", color: "#666" }}>
                      No subscriptions found
                    </span>
                  )}
                  {topic.subscriptions.map((sub) => (
                    <details key={sub.name} className="sub-item">
                      <summary>
                        📩 {sub.name}
                        <span className="count-badge">
                          ({sub.active_count}, {sub.scheduled_count},
                          <span
                            style={{
                              color:
                                sub.dead_letter_count > 0
                                  ? "#ff4d4d"
                                  : "inherit",
                            }}
                          >
                            {sub.dead_letter_count}
                          </span>
                          )
                        </span>
                      </summary>
                      <div className="actions">
                        <button
                          className="btn-peek"
                          onClick={() => handlePeek(topic.name, sub.name)}
                        >
                          Peek
                        </button>
                        <button className="btn-purge">Purge</button>
                        <button className="btn-dlq">DLQ</button>
                      </div>
                    </details>
                  ))}
                </div>
                <button
                  className="btn-send"
                  onClick={() => {
                    setSelectedTopic(topic.name);
                    setMessages([]);
                  }}
                >
                  + Send Message
                </button>
              </details>
            ))}
          </div>
        </aside>

        <div
          className={`panel-resizer-left ${isResizingLeft ? "resizing" : ""}`}
          onMouseDown={() => setIsResizingLeft(true)}
        />

        <main className="content">
          {messages.length > 0 ? (
            renderMessageViewer()
          ) : selectedTopic ? (
            <div className="send-form">
              <h3>
                Send Message to:{" "}
                <span className="highlight">{selectedTopic}</span>
              </h3>

              <div className="input-group">
                <label>System Subject (sys.Subject)</label>
                <input
                  value={label}
                  onChange={(e) => setLabel(e.currentTarget.value)}
                  placeholder="e.g. OrderCreated"
                />
              </div>

              {/* Ini kolom baru untuk SQL Filter Anda */}
              <div className="input-group">
                <label>Custom Properties (Untuk SqlFilter)</label>
                <textarea
                  value={customPropsStr}
                  onChange={(e) => setCustomPropsStr(e.target.value)}
                  rows={4}
                  spellCheck={false}
                  className="json-editor"
                  style={{ minHeight: "80px" }}
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

              <button
                className="btn-send-execute"
                onClick={handleSendMessage}
                disabled={loading}
              >
                {loading ? "Sending..." : "🚀 Send Message Now"}
              </button>
            </div>
          ) : (
            <div className="placeholder">Pilih aksi pada subscription</div>
          )}
        </main>
      </div>
      <footer
        className={`status-bar ${loading ? "status-loading" : "status-ready"}`}
      >
        <div className="status-left">
          {loading ? "⏳" : "✅"}
          <span className="log-text">{logMessage}</span>
        </div>
        <div className="status-right">Azure Service Bus By Awaluddin Dev</div>
      </footer>
    </div>
  );
}

export default App;
