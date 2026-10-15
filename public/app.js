:root {
  --bg: #0f172a;
  --panel: #111827;
  --panel-soft: #1f2937;
  --primary: #22c55e;
  --primary-strong: #16a34a;
  --text: #e5e7eb;
  --muted: #94a3b8;
  --border: rgba(148, 163, 184, 0.18);
  --danger: #ef4444;
  --warning: #f59e0b;
  --success: #10b981;
  --shadow: 0 25px 50px rgba(15, 23, 42, 0.3);
}

* {
  box-sizing: border-box;
}

html {
  color-scheme: dark;
}

body {
  margin: 0;
  background: linear-gradient(180deg, #020817 0%, #0f172a 100%);
  color: var(--text);
  font-family: Arial, Helvetica, sans-serif;
}

.container {
  width: min(1100px, calc(100% - 2rem));
  margin: 0 auto;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  backdrop-filter: blur(12px);
  background: rgba(15, 23, 42, 0.72);
  border-bottom: 1px solid var(--border);
}

.nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 0;
}

.brand {
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--primary);
}

nav {
  display: flex;
  gap: 1rem;
}

nav a {
  color: var(--text);
  text-decoration: none;
  opacity: 0.8;
}

.page {
  padding: 3rem 0 4rem;
}

.hero {
  display: grid;
  grid-template-columns: 1.4fr 0.9fr;
  gap: 2rem;
  align-items: center;
  margin-bottom: 2rem;
}

.badge {
  display: inline-block;
  margin-bottom: 1rem;
  padding: 0.45rem 0.8rem;
  background: rgba(34, 197, 94, 0.12);
  color: var(--primary);
  border: 1px solid rgba(34, 197, 94, 0.28);
  border-radius: 999px;
  font-size: 0.8rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.hero-copy h1 {
  font-size: clamp(2.2rem, 5vw, 4rem);
  line-height: 1.1;
  margin: 0;
}

.hero-copy p {
  color: var(--muted);
  font-size: 1.05rem;
  max-width: 52ch;
}

.grid {
  display: grid;
  gap: 2rem;
}

.two-col {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.panel,
.status-card {
  background: rgba(17, 24, 39, 0.88);
  border: 1px solid var(--border);
  border-radius: 18px;
  box-shadow: var(--shadow);
  padding: 1.5rem;
}

.status-card h2,
.panel h2 {
  margin-top: 0;
  margin-bottom: 1rem;
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  margin-top: 1.5rem;
}

.meta-grid span,
.stat-box span {
  display: block;
  color: var(--muted);
  font-size: 0.82rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.meta-grid strong,
.stat-box strong {
  display: block;
  margin-top: 0.45rem;
  font-size: 1.2rem;
}

.stack-form,
.inline-form {
  display: grid;
  gap: 1rem;
}

label {
  display: grid;
  gap: 0.45rem;
  color: var(--muted);
  font-size: 0.9rem;
}

input,
textarea,
select,
button {
  font: inherit;
}

input,
textarea,
select {
  width: 100%;
  padding: 0.9rem 1rem;
  background: rgba(15, 23, 42, 0.8);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 10px;
}

button {
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--primary) 0%, var(--primary-strong) 100%);
  color: #03130a;
  font-weight: 700;
  cursor: pointer;
  padding: 0.9rem 1.2rem;
  transition: transform 0.15s ease;
}

button:hover {
  transform: translateY(-1px);
}

.message {
  margin-top: 1rem;
  min-height: 1.5rem;
  color: var(--muted);
}

.message.error {
  color: #fca5a5;
}

.message.success {
  color: #86efac;
}

.receipt-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.8rem;
}

.receipt-list li {
  padding: 0.9rem 1rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.65);
}

.receipt-list strong {
  display: block;
  margin-bottom: 0.2rem;
}

.admin-page {
  max-width: 900px;
}

.admin-card {
  padding: 2rem;
}

.inline-form {
  grid-template-columns: minmax(200px, 1fr) auto;
  align-items: end;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  margin: 1.5rem 0;
}

.stat-box {
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1rem;
}

.table-panel {
  margin-top: 1.5rem;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  padding: 0.9rem 0.75rem;
  text-align: left;
  border-bottom: 1px solid var(--border);
}

th {
  color: var(--muted);
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

@media (max-width: 760px) {
  .hero,
  .two-col,
  .inline-form,
  .stats-grid {
    grid-template-columns: 1fr;
  }

  .nav {
    flex-direction: column;
    gap: 0.8rem;
  }
}
