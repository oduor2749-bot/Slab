const statusNode = document.getElementById('status');
const receiptListNode = document.getElementById('receiptList');
const receiptForm = document.getElementById('receiptForm');
const adminForm = document.getElementById('adminForm');
const payForm = document.getElementById('payForm');

async function loadHealth() {
  if (!statusNode) return;

  try {
    const response = await fetch('/health');
    const data = await response.json();
    statusNode.textContent = data.ok ? `Online • ${data.environment}` : 'Unavailable';
    statusNode.classList.toggle('success', data.ok);
  } catch (error) {
    statusNode.textContent = 'Offline';
    statusNode.classList.add('error');
  }
}

async function loadReceipts() {
  if (!receiptListNode) return;

  try {
    const response = await fetch('/api/receipts');
    const data = await response.json();

    if (!data.receipts || !data.receipts.length) {
      receiptListNode.innerHTML = '<li>No receipts yet.</li>';
      return;
    }

    receiptListNode.innerHTML = data.receipts
      .map(
        (receipt) => `
          <li>
            <strong>${receipt.amount || 'Unknown amount'}</strong>
            <div>From: ${receipt.sender || 'Unknown sender'}</div>
            <div>Status: ${receipt.status || 'pending'}</div>
            <div>${new Date(receipt.created_at).toLocaleString()}</div>
          </li>
        `
      )
      .join('');
  } catch (error) {
    receiptListNode.innerHTML = '<li>Unable to load receipts.</li>';
  }
}

if (receiptForm) {
  receiptForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(receiptForm);
    const payload = Object.fromEntries(formData.entries());
    const messageNode = document.getElementById('receiptMessage');

    try {
      const response = await fetch('/api/receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save receipt');
      }

      messageNode.textContent = 'Receipt saved successfully.';
      messageNode.className = 'message success';
      receiptForm.reset();
      loadReceipts();
    } catch (error) {
      messageNode.textContent = error.message;
      messageNode.className = 'message error';
    }
  });
}

if (payForm) {
  payForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const amount = document.getElementById('payAmount').value;
    const phone = document.getElementById('payPhone').value;
    const accountReference = document.getElementById('payRef').value || 'SLAB';
    const messageNode = document.getElementById('payMessage');

    messageNode.textContent = 'Initiating STK Push...';
    messageNode.className = 'message';

    try {
      const resp = await fetch('/api/mpesa/stkpush', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, phone, accountReference, transactionDesc: 'Payment' }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error((data && data.error) || 'Failed to initiate STK push');
      }

      const checkoutId = data.checkoutId || (data.daraja && data.daraja.CheckoutRequestID) || null;
      messageNode.textContent = 'STK initiated. Check your phone for the M-Pesa prompt.' + (checkoutId ? ` (Checkout: ${checkoutId})` : '');
      messageNode.className = 'message success';

      // Optionally refresh receipts after a delay to surface the pending receipt
      setTimeout(loadReceipts, 3000);
    } catch (err) {
      messageNode.textContent = err.message || 'STK push failed';
      messageNode.className = 'message error';
    }
  });
}

if (adminForm) {
  adminForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const key = document.getElementById('adminKey').value.trim();
    const messageNode = document.getElementById('adminMessage');
    const statsGrid = document.getElementById('statsGrid');
    const tableBody = document.getElementById('adminTableBody');

    try {
      const response = await fetch(`/api/admin?key=${encodeURIComponent(key)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Unauthorized');
      }

      statsGrid.hidden = false;
      document.getElementById('receiptCount').textContent = data.receiptsCount ?? 0;
      document.getElementById('inboxCount').textContent = data.inboxCount ?? 0;

      if (!data.receipts || !data.receipts.length) {
        tableBody.innerHTML = '<tr><td colspan="5">No receipts found.</td></tr>';
        return;
      }

      tableBody.innerHTML = data.receipts
        .map(
          (receipt) => `
            <tr>
              <td>${receipt.id}</td>
              <td>${receipt.amount || '—'}</td>
              <td>${receipt.sender || '—'}</td>
              <td>${receipt.status || 'pending'}</td>
              <td>${receipt.created_at ? new Date(receipt.created_at).toLocaleString() : '—'}</td>
            </tr>
          `
        )
        .join('');

      messageNode.textContent = 'Dashboard loaded.';
      messageNode.className = 'message success';
    } catch (error) {
      messageNode.textContent = error.message;
      messageNode.className = 'message error';
    }
  });
}

loadHealth();
loadReceipts();
