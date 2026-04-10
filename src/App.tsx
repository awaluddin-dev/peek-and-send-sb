import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import Editor from "@monaco-editor/react";
import {
  Folder,
  CornerDownRight,
  Inbox,
  AlertTriangle,
  Trash2,
  Power,
  PowerOff,
  Send,
  ChevronUpCircle,
  ChevronDownCircle,
  Loader2,
  CheckCircle2,
  Save,
  Server,
} from "lucide-react";
import "./App.css";

interface Subscription {
  name: string;
  active_count: number;
  dead_letter_count: number;
  scheduled_count: number;
}

type SavedConnection = {
  id: string;
  name: string;
  uri: string;
};

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

// trying to refactor

function App() {
  const [savedConnections, setSavedConnections] = useState<SavedConnection[]>(
    [],
  );
  const [newConnName, setNewConnName] = useState("");
  const [uri, setUri] = useState("");
  const [status, setStatus] = useState("");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(false);
  const [logMessage, setLogMessage] = useState("Ready");
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [payload, setPayload] = useState('{\n  "key": "value"\n}');
  // const [label, setLabel] = useState("");
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
    '{\n  "topic_name": "auth-service"\n}',
  );
  const [isViewingDlq, setIsViewingDlq] = useState(false);
  const [currentPeekSub, setCurrentPeekSub] = useState("");
  const [currentPeekTopic, setCurrentPeekTopic] = useState("");
  const fetchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    const stored = localStorage.getItem("sb_saved_connections");
    if (stored) {
      try {
        setSavedConnections(JSON.parse(stored));
      } catch (e) {
        console.error("Gagal membaca koneksi tersimpan");
      }
    }
  }, []);

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

  // 2. Fungsi untuk menyimpan koneksi baru
  const handleSaveConnection = () => {
    if (!uri.trim()) {
      alert("Masukkan Connection String (URI) terlebih dahulu!");
      return;
    }

    // Beri nama default jika input nama kosong
    const nameToSave =
      newConnName.trim() || `Connection ${savedConnections.length + 1}`;

    const newConnection: SavedConnection = {
      id: Date.now().toString(), // ID unik menggunakan timestamp
      name: nameToSave,
      uri: uri.trim(),
    };

    const updatedConnections = [...savedConnections, newConnection];
    setSavedConnections(updatedConnections);
    localStorage.setItem(
      "sb_saved_connections",
      JSON.stringify(updatedConnections),
    );

    setNewConnName(""); // Kosongkan form nama setelah sukses
    alert(`Koneksi '${nameToSave}' berhasil disimpan!`);
  };

  // 3. Fungsi untuk menghapus koneksi
  const handleDeleteConnection = (id: string, name: string) => {
    if (!window.confirm(`Hapus koneksi tersimpan '${name}'?`)) return;

    const updatedConnections = savedConnections.filter(
      (conn) => conn.id !== id,
    );
    setSavedConnections(updatedConnections);
    localStorage.setItem(
      "sb_saved_connections",
      JSON.stringify(updatedConnections),
    );
  };

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

  const handleToggleTopic = (topicName: string, e: React.MouseEvent) => {
    e.preventDefault(); // Mencegah browser melakukan toggle otomatis yang bikin glitch

    setExpandedTopics((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(topicName)) {
        newSet.delete(topicName); // Tutup jika sedang terbuka
      } else {
        newSet.add(topicName); // Buka jika sedang tertutup
      }
      return newSet;
    });

    // Tetap jalankan logika sebelumnya
    setSelectedTopic(topicName);
    setMessages([]);
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
    setLogMessage(`Memvalidasi dan mengirim pesan ke ${selectedTopic}...`);

    // 1. Auto-format & Validasi Custom Properties
    let parsedProps = {};
    if (customPropsStr.trim() !== "") {
      try {
        parsedProps = JSON.parse(customPropsStr);
        // Rapikan teks di editor agar user melihat hasil formatnya
        setCustomPropsStr(JSON.stringify(parsedProps, null, 2));
      } catch (e) {
        alert(
          "Gagal mengirim: Format Custom Properties harus berupa JSON yang valid!",
        );
        setLoading(false);
        return; // Hentikan proses jika JSON error
      }
    }

    // 2. Auto-format & Validasi JSON Payload Utama
    let formattedPayload = payload;
    try {
      const parsedPayload = JSON.parse(payload);
      // Rapikan teks payload utama
      formattedPayload = JSON.stringify(parsedPayload, null, 2);
      setPayload(formattedPayload);
    } catch (e) {
      alert(
        "Gagal mengirim: JSON Payload tidak valid! Silakan perbaiki garis merah di editor.",
      );
      setLoading(false);
      return; // Hentikan proses jika JSON error
    }

    // 3. Kirim ke Rust jika semua JSON sudah valid
    try {
      const result = await invoke<string>("send_sb_message", {
        uri,
        topicName: selectedTopic,
        messageBody: formattedPayload,
        subject: "",
        customProperties: parsedProps,
      });
      setLogMessage(result);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Ambil data terbaru dari Rust
      const updatedTopics = await invoke<Topic[]>(
        "get_topics_and_subscriptions",
        { uri },
      );
      setTopics(updatedTopics);

      // Alert muncul SETELAH angka di sidebar berhasil diperbarui!
      alert("Pesan Berhasil Terkirim!");
    } catch (err) {
      setLogMessage(`Gagal mengirim: ${err}`);
      alert(err);
    } finally {
      setLoading(false);
    }
  }

  async function handlePeek(
    topic: string,
    sub: string,
    dlq: boolean = false,
    overrideFetchCount?: number,
  ) {
    const currentLimit =
      overrideFetchCount !== undefined ? overrideFetchCount : fetchCount;
    setLoading(true);
    setLogMessage(`Mengambil maksimal ${fetchCount} pesan dari ${sub}...`);

    try {
      // PERBAIKAN 1: Ubah <string[]> menjadi <ServiceBusMessage[]>
      const data = await invoke<ServiceBusMessage[]>("peek_messages", {
        uri,
        topic,
        sub,
        isDlq: dlq,
        maxMessages: currentLimit,
      });
      setMessages(data);
      setCurrentPage(1);
      setExpandedMessages(new Set()); // Reset expand state
      setSelectedMessage(null); // Reset selected state
      setSelectedTopic(null);
      setIsViewingDlq(dlq);
      setCurrentPeekSub(sub);
      setCurrentPeekTopic(topic);
      setLogMessage(`Berhasil melihat ${data.length} pesan.`);
    } catch (err) {
      setLogMessage(`Gagal peek: ${err}`);
      alert(err);
    } finally {
      setLoading(false);
    }
  }

  // --- FUNGSI PURGE MESSAGES ---
  async function handlePurge(topic: string, sub: string, dlq: boolean) {
    const queueType = dlq ? "DEAD-LETTER QUEUE (DLQ)" : "ACTIVE QUEUE";

    const confirmMsg = `⚠️ PERINGATAN BAHAYA ⚠️\n\nApakah Anda yakin ingin MENGHAPUS SEMUA PESAN di ${queueType} untuk subscription '${sub}'?\n\nTindakan ini TIDAK BISA dibatalkan!`;
    if (!window.confirm(confirmMsg)) return;

    setLoading(true);
    setLogMessage(
      `Sedang menyapu bersih semua pesan di ${sub} (${queueType})...`,
    );

    try {
      // 1. Eksekusi penghapusan di Rust
      const purgedCount = await invoke<number>("purge_messages", {
        uri,
        topic,
        sub,
        isDlq: dlq,
      });

      setLogMessage(`Menunggu sinkronisasi metrik Azure...`);

      // 2. PERBAIKAN BUG TIMING: Tunggu 1 detik secara sinkron sebelum lanjut
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // 3. Ambil angka terbaru dari Azure dan langsung update sidebar
      const updatedTopics = await invoke<Topic[]>(
        "get_topics_and_subscriptions",
        { uri },
      );
      setTopics(updatedTopics);

      // 4. PERBAIKAN BUG LAYAR SEND MESSAGE
      // Hanya kosongkan layar jika antrean yang di-purge SAMA dengan yang sedang di-peek.
      // Jika user sedang di layar Send Message, layar tidak akan terganggu!
      if (
        currentPeekTopic === topic &&
        currentPeekSub === sub &&
        isViewingDlq === dlq
      ) {
        setMessages([]);
      }

      // 5. Munculkan Alert Paling Akhir (setelah angka di belakangnya sudah 0)
      setLogMessage(`Purge selesai. ${purgedCount} pesan dihapus.`);
      alert(
        `Selesai! Berhasil menghapus total ${purgedCount} pesan dari ${queueType}.`,
      );
    } catch (err) {
      setLogMessage(`Gagal purge: ${err}`);
      alert(`Error saat melakukan purge:\n${err}`);
    } finally {
      setLoading(false);
    }
  }

  function renderConnectForm() {
    return (
      <div className="connect-screen">
        <div
          className="connect-card"
          style={{ maxWidth: "600px", width: "100%" }}
        >
          <h2
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
            }}
          >
            <Server /> Awl Service Bus For Azure
          </h2>

          {/* --- DAFTAR KONEKSI TERSIMPAN --- */}
          {savedConnections.length > 0 && (
            <div
              style={{
                background: "rgba(0,0,0,0.2)",
                padding: "15px",
                borderRadius: "8px",
                marginBottom: "20px",
                textAlign: "left",
              }}
            >
              <label
                style={{
                  fontSize: "12px",
                  color: "#aaa",
                  marginBottom: "10px",
                  display: "block",
                }}
              >
                KONEKSI TERSIMPAN:
              </label>
              <div
                style={{ display: "flex", flexDirection: "column", gap: "8px" }}
              >
                {savedConnections.map((conn) => (
                  <div key={conn.id} className="saved-connection-item">
                    {/* Area Teks (Klik untuk memakai URI ini) */}
                    <div
                      style={{ flex: 1, cursor: "pointer", overflow: "hidden" }}
                      onClick={() => setUri(conn.uri)}
                      title="Klik untuk memasukkan URI ini ke kotak di bawah"
                    >
                      <div
                        style={{
                          fontWeight: "bold",
                          fontSize: "14px",
                          color: "#fff",
                        }}
                      >
                        {conn.name}
                      </div>
                      <div
                        style={{
                          fontSize: "11px",
                          color: "#888",
                          whiteSpace: "nowrap",
                          textOverflow: "ellipsis",
                          overflow: "hidden",
                        }}
                      >
                        {conn.uri.substring(0, 45)}...
                      </div>
                    </div>

                    {/* Tombol Hapus */}
                    <button
                      className="btn-clear"
                      onClick={() => handleDeleteConnection(conn.id, conn.name)}
                      style={{ backgroundColor: "#ff4444", padding: "5px" }}
                      title="Hapus Koneksi"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* --- FORM INPUT URI UTAMA --- */}
          <div className="input-group" style={{ textAlign: "left" }}>
            <label>Connection String (URI)</label>
            <textarea
              placeholder="Endpoint=sb://your-namespace.servicebus.windows.net/;SharedAccessKeyName=...;"
              value={uri}
              onChange={(e) => setUri(e.target.value)}
              rows={4}
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: "4px",
                background: "#1e1e1e",
                color: "#fff",
                border: "1px solid #555",
                fontFamily: "monospace",
                fontSize: "13px",
              }}
            />
          </div>

          {/* --- ALAT SIMPAN KONEKSI BARU --- */}
          <div style={{ display: "flex", gap: "10px", marginBottom: "25px" }}>
            <input
              type="text"
              placeholder="Beri nama koneksi (opsional)..."
              value={newConnName}
              onChange={(e) => setNewConnName(e.target.value)}
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: "4px",
                background: "#1e1e1e",
                color: "#fff",
                border: "1px solid #555",
              }}
            />
            <button
              onClick={handleSaveConnection}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                background: "#007acc",
                color: "white",
                border: "none",
                padding: "0 15px",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              <Save size={16} /> Simpan URI
            </button>
          </div>

          {/* --- TOMBOL CONNECT --- */}
          <button
            className="btn-connect"
            onClick={handleConnect}
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px",
              fontSize: "16px",
              fontWeight: "bold",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="icon-spin" /> Menghubungkan...
              </>
            ) : (
              <>
                <Power size={16} /> Connect Now
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  const renderMessageBody = (rawBody: string) => {
    try {
      const parsed = JSON.parse(rawBody);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return rawBody;
    }
  };

  const triggerAutoPeek = (overrideLimit?: number) => {
    if (currentPeekTopic && currentPeekSub) {
      handlePeek(currentPeekTopic, currentPeekSub, isViewingDlq, overrideLimit);
    }
  };

  const handleFetchCountChange = (val: number) => {
    setFetchCount(val); // Tetap update UI

    if (fetchTimeout.current) clearTimeout(fetchTimeout.current);

    fetchTimeout.current = setTimeout(() => {
      // Injeksi nilai 'val' (ketikan terbaru) secara langsung! Tembus dari antrean React.
      triggerAutoPeek(val);
    }, 1500);
  };

  const handleFetchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (fetchTimeout.current) clearTimeout(fetchTimeout.current);
      // Ambil angka persis yang sedang tertulis di kotak input saat Enter ditekan
      const exactValue = Number(e.currentTarget.value);
      triggerAutoPeek(exactValue);
    }
  };
  const handlePageSizeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (fetchTimeout.current) clearTimeout(fetchTimeout.current);
      // Ambil angka persis yang sedang tertulis di kotak input saat Enter ditekan
      const exactValue = Number(e.currentTarget.value);
      setPageSize(exactValue);
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
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <h3>
                Peek{" "}
                {isViewingDlq && (
                  <span style={{ color: "#ff4444" }}>[DLQ]</span>
                )}{" "}
                ({messages.length})
              </h3>
              <span style={{ fontSize: "13px", color: "#888" }}>
                {currentPeekSub}
              </span>
            </div>
            <div className="viewer-controls">
              {/* PERBAIKAN 3: Kembalikan fitur Dropdown Fetch Config & Clear */}
              <label style={{ fontSize: "12px" }}>Fetch Max:</label>
              <input
                type="number"
                value={fetchCount}
                onChange={(e) => handleFetchCountChange(Number(e.target.value))}
                onKeyDown={handleFetchKeyDown}
                className="select-list"
                min={1}
                style={{
                  width: "60px",
                  background: "#3c3c3c",
                  color: "white",
                  border: "1px solid #555",
                  padding: "4px",
                  borderRadius: "4px",
                }}
              />
              <label style={{ fontSize: "12px" }}>Page Size:</label>
              <input
                type="number"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                onKeyDown={handlePageSizeKeyDown}
                className="select-list"
                min={1}
                style={{
                  width: "60px",
                  background: "#3c3c3c",
                  color: "white",
                  border: "1px solid #555",
                  padding: "4px",
                  borderRadius: "4px",
                }}
              />
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
                        {isExpanded ? (
                          <ChevronUpCircle size={16} />
                        ) : (
                          <ChevronDownCircle size={16} />
                        )}
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
      {/* --- LOGIKA RENDER LAYAR --- */}
      {status !== "Connected" ? (
        // 1. JIKA BELUM CONNECT: Tampilkan form koneksi full layar
        renderConnectForm()
      ) : (
        // 2. JIKA SUDAH CONNECT: Tampilkan Layout Utama (Sidebar + Main Content)
        <div className="container">
          {/* --- SIDEBAR KIRI --- */}
          <aside className="sidebar" style={{ width: `${detailWidthLeft}px` }}>
            <h2>Awl Service Bus</h2>

            {/* Tombol Disconnect di Sidebar */}
            <div className="connection-form">
              <button
                className="btn-clear"
                onClick={handleDisconnect}
                style={{
                  width: "100%",
                  fontWeight: "bold",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  padding: "8px",
                }}
              >
                <PowerOff size={16} /> Disconnect
              </button>
            </div>

            <p className="status-text">Terhubung ke Service Bus</p>

            <hr
              style={{
                height: "2px",
                width: "100%",
                margin: "0px",
                padding: "0px",
              }}
            />

            {/* List Topic & Subscription */}
            <div className="topic-list">
              {topics.map((topic) => (
                <details key={topic.name} open={expandedTopics.has(topic.name)}>
                  <summary
                    onClick={(e) => handleToggleTopic(topic.name, e)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      cursor: "pointer",
                    }}
                  >
                    <Folder size={16} color="#007acc" />
                    {topic.name}
                  </summary>

                  {topic.subscriptions.map((sub) => (
                    <div key={sub.name} className="subscription-list">
                      <div
                        style={{
                          padding: "5px 0",
                          color: "#aaa",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <CornerDownRight size={14} />
                        {sub.name}
                      </div>

                      {/* Tombol Actions Active & DLQ */}
                      <div
                        className="actions"
                        style={{ gap: "8px", flexWrap: "wrap" }}
                      >
                        <div style={{ display: "flex", width: "100%" }}>
                          <button
                            onClick={() => {
                              handlePeek(topic.name, sub.name, false, 20);
                              setFetchCount(20);
                            }}
                            disabled={sub.active_count === 0}
                            title="Lihat pesan aktif"
                            style={{
                              flex: 1,
                              borderRadius: "4px 0 0 4px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "6px",
                            }}
                          >
                            <Inbox size={14} /> Active ({sub.active_count})
                          </button>

                          <button
                            className="btn-clear"
                            onClick={() =>
                              handlePurge(topic.name, sub.name, false)
                            }
                            disabled={sub.active_count === 0}
                            style={{
                              borderRadius: "0 4px 4px 0",
                              padding: "0 10px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              backgroundColor:
                                sub.active_count > 0 ? "#ff4444" : "",
                            }}
                            title="Hapus permanen semua pesan Active"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        <div style={{ display: "flex", width: "100%" }}>
                          <button
                            onClick={() =>
                              handlePeek(topic.name, sub.name, true)
                            }
                            disabled={sub.dead_letter_count === 0}
                            style={{
                              flex: 1,
                              borderRadius: "4px 0 0 4px",
                              backgroundColor:
                                sub.dead_letter_count > 0 ? "#d9534f" : "",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "6px",
                            }}
                            title="Lihat pesan yang nyangkut di DLQ"
                          >
                            <AlertTriangle size={14} /> DLQ (
                            {sub.dead_letter_count})
                          </button>

                          <button
                            className="btn-clear"
                            onClick={() =>
                              handlePurge(topic.name, sub.name, true)
                            }
                            disabled={sub.dead_letter_count === 0}
                            style={{
                              borderRadius: "0 4px 4px 0",
                              padding: "0 10px",
                              backgroundColor:
                                sub.dead_letter_count > 0 ? "#ff4444" : "",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                            title="Hapus permanen semua pesan DLQ"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </details>
              ))}
            </div>
          </aside>

          <div
            className={`panel-resizer-left ${isResizingLeft ? "resizing" : ""}`}
            onMouseDown={() => setIsResizingLeft(true)}
          />

          {/* --- MAIN CONTENT (KANAN) --- */}
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
                  <label>Custom Properties (Untuk SqlFilter)</label>
                  <div
                    style={{
                      border: "1px solid var(--border-color)",
                      borderRadius: "4px",
                      overflow: "hidden",
                    }}
                  >
                    <Editor
                      height="120px"
                      defaultLanguage="json"
                      theme="vs-dark"
                      value={customPropsStr}
                      onChange={(value) => setCustomPropsStr(value || "")}
                      options={{
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        fontSize: 13,
                        fontFamily: "'Fira Code', Consolas, monospace",
                      }}
                    />
                  </div>
                </div>

                <div className="input-group">
                  <label>JSON Payload</label>
                  <div
                    style={{
                      border: "1px solid var(--border-color)",
                      borderRadius: "4px",
                      overflow: "hidden",
                    }}
                  >
                    <Editor
                      height="300px"
                      defaultLanguage="json"
                      theme="vs-dark"
                      value={payload}
                      onChange={(value) => setPayload(value || "")}
                      options={{
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        fontSize: 13,
                        fontFamily: "'Fira Code', Consolas, monospace",
                        formatOnPaste: true,
                      }}
                    />
                  </div>
                </div>

                {/* Bungkus tombol send agar rapi (tambahkan margin top) */}
                <div style={{ marginTop: "20px" }}>
                  <button
                    className="btn-send-execute"
                    onClick={handleSendMessage}
                    disabled={loading}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                    }}
                  >
                    {loading ? (
                      <>
                        <Loader2 size={16} className="icon-spin" />{" "}
                        Processing...
                      </>
                    ) : (
                      <>
                        <Send size={18} /> Format & Send Message Now
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="placeholder">Pilih aksi pada subscription</div>
            )}
          </main>
        </div>
      )}

      {/* --- FOOTER STATUS BAR (Selalu Muncul) --- */}
      <footer
        className={`status-bar ${loading ? "status-loading" : "status-ready"}`}
      >
        <div className="status-left">
          {loading ? (
            <Loader2 size={16} className="icon-spin" />
          ) : (
            <CheckCircle2 size={16} />
          )}
          <span className="log-text" style={{ marginLeft: "4px" }}>
            {logMessage}
          </span>
        </div>
        <div
          className="status-right"
          style={{ fontWeight: "bold", opacity: 0.8 }}
        >
          Awl Service Bus
        </div>
      </footer>
    </div>
  );
}

export default App;
