/**
 * PCC-MO Dashboard JavaScript
 */

// State
let currentPage = 1;
const pageSize = 20;
let totalOrders = 0;
let allOrders = [];

// DOM Ready
document.addEventListener('DOMContentLoaded', () => {
    loadOrders();

    // Set default date filter to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('date-filter').value = today;
});

/**
 * Load orders from API
 */
async function loadOrders() {
    const tbody = document.getElementById('orders-tbody');
    tbody.innerHTML = `
    <tr class="loading-row">
      <td colspan="8">
        <div class="loading-spinner"></div>
        <span>กำลังโหลดข้อมูล...</span>
      </td>
    </tr>
  `;

    try {
        const offset = (currentPage - 1) * pageSize;
        const response = await fetch(`/api/orders?limit=${pageSize}&offset=${offset}`);
        const data = await response.json();

        allOrders = data.orders;
        totalOrders = data.total;

        renderOrders(allOrders);
        updateStats();
        updatePagination();
        loadDailySummary();
    } catch (error) {
        console.error('Error loading orders:', error);
        tbody.innerHTML = `
      <tr>
        <td colspan="8" class="no-data">❌ เกิดข้อผิดพลาดในการโหลดข้อมูล</td>
      </tr>
    `;
        showToast('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'error');
    }
}

/**
 * Render orders to table
 */
function renderOrders(orders) {
    const tbody = document.getElementById('orders-tbody');

    // Apply filters
    const dateFilter = document.getElementById('date-filter').value;
    const factoryFilter = document.getElementById('factory-filter').value;
    const productFilter = document.getElementById('product-filter').value;

    let filteredOrders = orders;

    if (dateFilter) {
        filteredOrders = filteredOrders.filter(o => o.order_date === dateFilter);
    }
    if (factoryFilter) {
        filteredOrders = filteredOrders.filter(o => o.factory_id == factoryFilter);
    }
    if (productFilter) {
        filteredOrders = filteredOrders.filter(o => o.product_code === productFilter);
    }

    if (filteredOrders.length === 0) {
        tbody.innerHTML = `
      <tr>
        <td colspan="8" class="no-data">ไม่พบข้อมูล</td>
      </tr>
    `;
        return;
    }

    tbody.innerHTML = filteredOrders.map(order => `
    <tr>
      <td><strong>#${order.id}</strong></td>
      <td>${formatDate(order.order_date)}</td>
      <td>
        <span class="factory-badge">🏭 โรง ${order.factory_id || '-'}</span>
      </td>
      <td>
        <span class="product-code">${order.product_code || '-'}</span>
      </td>
      <td class="product-detail" title="${escapeHtml(order.product_detail || '')}">
        ${escapeHtml(order.product_detail || '-')}
      </td>
      <td>
        <strong>${order.cement_quantity ? order.cement_quantity.toFixed(2) : '-'}</strong>
      </td>
      <td>
        ${order.synced_to_sheets
            ? '<span class="sync-badge synced">✓ Synced</span>'
            : '<span class="sync-badge pending">○ Pending</span>'}
      </td>
      <td>${formatDateTime(order.created_at)}</td>
    </tr>
  `).join('');
}

/**
 * Update header stats
 */
async function updateStats() {
    document.getElementById('total-orders').textContent = totalOrders.toLocaleString();

    // Count today's orders
    const today = new Date().toISOString().split('T')[0];
    const todayOrders = allOrders.filter(o => o.order_date === today).length;
    document.getElementById('today-orders').textContent = todayOrders.toLocaleString();

    // Total cement
    const totalCement = allOrders.reduce((sum, o) => sum + (o.cement_quantity || 0), 0);
    document.getElementById('total-cement').textContent = totalCement.toFixed(2);
}

/**
 * Load daily summary
 */
async function loadDailySummary() {
    const date = document.getElementById('date-filter').value;
    const container = document.getElementById('daily-summary');

    if (!date) {
        container.innerHTML = '<p class="no-data">เลือกวันที่เพื่อดูสรุป</p>';
        return;
    }

    try {
        const response = await fetch(`/api/summary/${date}`);
        const data = await response.json();

        if (!data.summary || data.summary.length === 0) {
            container.innerHTML = '<p class="no-data">ไม่มีข้อมูลสำหรับวันที่เลือก</p>';
            return;
        }

        container.innerHTML = data.summary.map(item => `
      <div class="summary-card">
        <div class="summary-card-header">
          <span class="summary-factory">🏭 โรง ${item.factory_id || '-'}</span>
          <span class="summary-product">รวม</span>
        </div>
        <div class="summary-value">${(item.total_cement || 0).toFixed(2)}</div>
        <div class="summary-label">${item.order_count} รายการ</div>
      </div>
    `).join('');
    } catch (error) {
        console.error('Error loading summary:', error);
        container.innerHTML = '<p class="no-data">❌ เกิดข้อผิดพลาด</p>';
    }
}

/**
 * Pagination
 */
function updatePagination() {
    const totalPages = Math.ceil(totalOrders / pageSize);
    document.getElementById('page-info').textContent = `หน้า ${currentPage} / ${totalPages || 1}`;

    document.getElementById('prev-btn').disabled = currentPage <= 1;
    document.getElementById('next-btn').disabled = currentPage >= totalPages;
}

function prevPage() {
    if (currentPage > 1) {
        currentPage--;
        loadOrders();
    }
}

function nextPage() {
    const totalPages = Math.ceil(totalOrders / pageSize);
    if (currentPage < totalPages) {
        currentPage++;
        loadOrders();
    }
}

/**
 * Reset filters
 */
function resetFilters() {
    document.getElementById('date-filter').value = '';
    document.getElementById('factory-filter').value = '';
    document.getElementById('product-filter').value = '';
    currentPage = 1;
    loadOrders();
}

/**
 * Sync to Google Sheets
 */
async function syncToSheets() {
    try {
        showToast('📤 กำลัง Sync ไป Google Sheets...', 'info');

        const response = await fetch('/api/sync', { method: 'POST' });
        const data = await response.json();

        if (data.error) {
            showToast(`❌ ${data.error}`, 'error');
        } else if (data.synced > 0) {
            showToast(`✅ Sync สำเร็จ ${data.synced} รายการ`, 'success');
            loadOrders(); // Refresh to update sync status
        } else {
            showToast('✓ ไม่มีรายการที่ต้อง Sync', 'success');
        }
    } catch (error) {
        console.error('Error syncing:', error);
        showToast('❌ เกิดข้อผิดพลาดในการ Sync', 'error');
    }
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;

    setTimeout(() => {
        toast.className = 'toast';
    }, 3000);
}

/**
 * Utility functions
 */
function formatDate(dateStr) {
    if (!dateStr) return '-';
    const [year, month, day] = dateStr.split('-');
    return `${parseInt(day)}/${parseInt(month)}/${parseInt(year) + 543}`;
}

function formatDateTime(dateTimeStr) {
    if (!dateTimeStr) return '-';
    try {
        const date = new Date(dateTimeStr);
        return date.toLocaleString('th-TH', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return dateTimeStr;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
