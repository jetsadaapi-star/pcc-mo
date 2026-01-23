/**
 * PCC-MO Dashboard JavaScript
 */

let currentPage = 1;
const pageSize = 20;
let totalOrders = 0;
let allOrders = [];

// DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  initReportControls();
  setDefaultInputs();
  loadOrders();
  loadReport();
});

function initReportControls() {
  const periodButtons = document.querySelectorAll('.segmented-btn');
  periodButtons.forEach(button => {
    button.addEventListener('click', () => {
      periodButtons.forEach(btn => {
        btn.classList.remove('is-active');
        btn.setAttribute('aria-pressed', 'false');
      });
      button.classList.add('is-active');
      button.setAttribute('aria-pressed', 'true');
      const periodInput = document.getElementById('report-period');
      if (periodInput) {
        periodInput.value = button.dataset.period || 'daily';
      }
      toggleReportInputs();
      loadReport();
    });
  });

  const reportDate = document.getElementById('report-date');
  if (reportDate) {
    reportDate.addEventListener('change', loadReport);
  }

  const reportMonth = document.getElementById('report-month');
  if (reportMonth) {
    reportMonth.addEventListener('change', loadReport);
  }
}

function setDefaultInputs() {
  const today = new Date();
  const isoDate = today.toISOString().split('T')[0];
  const isoMonth = isoDate.slice(0, 7);

  const dateFilter = document.getElementById('date-filter');
  if (dateFilter) {
    dateFilter.value = isoDate;
  }

  const reportDate = document.getElementById('report-date');
  if (reportDate) {
    reportDate.value = isoDate;
  }

  const reportMonth = document.getElementById('report-month');
  if (reportMonth) {
    reportMonth.value = isoMonth;
  }

  toggleReportInputs();
}

function toggleReportInputs() {
  const period = getReportPeriod();
  const dateGroup = document.getElementById('report-date-group');
  const monthGroup = document.getElementById('report-month-group');

  if (dateGroup && monthGroup) {
    if (period === 'monthly') {
      dateGroup.style.display = 'none';
      monthGroup.style.display = 'flex';
    } else {
      dateGroup.style.display = 'flex';
      monthGroup.style.display = 'none';
    }
  }

  const periodLabel = document.getElementById('period-orders-label');
  if (periodLabel) {
    periodLabel.textContent = period === 'monthly' ? 'รายการรายเดือน' : 'รายการรายวัน';
  }
}

function getReportPeriod() {
  const periodInput = document.getElementById('report-period');
  return periodInput?.value || 'daily';
}

/**
 * Load orders from API
 */
async function loadOrders() {
  const tbody = document.getElementById('orders-tbody');
  if (tbody) {
    tbody.innerHTML = `
      <tr class="loading-row">
        <td colspan="8">
          <div class="loading-spinner"></div>
          <span>กำลังโหลดข้อมูล...</span>
        </td>
      </tr>
    `;
  }

  try {
    const offset = (currentPage - 1) * pageSize;
    const response = await fetch(`/api/orders?limit=${pageSize}&offset=${offset}`);
    const data = await response.json();

    allOrders = data.orders || [];
    totalOrders = data.total || 0;

    renderOrders(allOrders);
    updateTotalOrders();
    updatePagination();
    setLastUpdated();
  } catch (error) {
    console.error('Error loading orders:', error);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="no-data">❌ เกิดข้อผิดพลาดในการโหลดข้อมูล</td>
        </tr>
      `;
    }
    showToast('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'error');
  }
}

/**
 * Render orders to table
 */
function renderOrders(orders) {
  const tbody = document.getElementById('orders-tbody');
  if (!tbody) return;

  const dateFilter = document.getElementById('date-filter')?.value;
  const factoryFilter = document.getElementById('factory-filter')?.value;
  const productFilter = document.getElementById('product-filter')?.value;

  let filteredOrders = orders;

  if (dateFilter) {
    filteredOrders = filteredOrders.filter(order => order.order_date === dateFilter);
  }
  if (factoryFilter) {
    filteredOrders = filteredOrders.filter(order => String(order.factory_id) === factoryFilter);
  }
  if (productFilter) {
    filteredOrders = filteredOrders.filter(order => order.product_code === productFilter);
  }

  if (filteredOrders.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="no-data">ไม่พบข้อมูล</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filteredOrders.map(order => {
    const cementValue = Number(order.cement_quantity);
    const cementDisplay = Number.isFinite(cementValue) ? cementValue.toFixed(2) : '-';
    return `
      <tr>
        <td data-label="ID"><strong>#${order.id}</strong></td>
        <td data-label="วันที่">${formatDate(order.order_date)}</td>
        <td data-label="โรงงาน">
          <span class="factory-badge">🏭 โรง ${order.factory_id || '-'}</span>
        </td>
        <td data-label="รหัส">
          <span class="product-code">${order.product_code || '-'}</span>
        </td>
        <td data-label="รายละเอียด" class="product-detail" title="${escapeHtml(order.product_detail || '')}">
          ${escapeHtml(order.product_detail || '-')}
        </td>
        <td data-label="ปูน (คิว)">
          <strong>${cementDisplay}</strong>
        </td>
        <td data-label="สถานะ Sync">
          ${order.synced_to_sheets
            ? '<span class="sync-badge synced">✓ Synced</span>'
            : '<span class="sync-badge pending">○ Pending</span>'}
        </td>
        <td data-label="สร้างเมื่อ">${formatDateTime(order.created_at)}</td>
      </tr>
    `;
  }).join('');
}

function updateTotalOrders() {
  const totalOrdersElement = document.getElementById('total-orders');
  if (totalOrdersElement) {
    totalOrdersElement.textContent = totalOrders.toLocaleString();
  }

  const ordersCount = document.getElementById('orders-count');
  if (ordersCount) {
    ordersCount.textContent = `ทั้งหมด ${totalOrders.toLocaleString()} รายการ`;
  }
}

/**
 * Load report data (daily/monthly)
 */
async function loadReport() {
  const period = getReportPeriod();
  const date = document.getElementById('report-date')?.value;
  const month = document.getElementById('report-month')?.value;

  const factoryList = document.getElementById('factory-report-list');
  const productList = document.getElementById('product-report-list');
  if (factoryList) {
    factoryList.innerHTML = '<p class="no-data">กำลังโหลดรายงาน...</p>';
  }
  if (productList) {
    productList.innerHTML = '<p class="no-data">กำลังโหลดรายงาน...</p>';
  }

  const params = new URLSearchParams({ period });
  if (period === 'monthly') {
    if (!month) {
      return;
    }
    params.set('month', month);
  } else {
    if (!date) {
      return;
    }
    params.set('date', date);
  }

  try {
    const response = await fetch(`/api/reports?${params.toString()}`);
    const data = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    renderReportData(data, period, date, month);
    setLastUpdated();
  } catch (error) {
    console.error('Error loading report:', error);
    if (factoryList) {
      factoryList.innerHTML = '<p class="no-data">❌ โหลดรายงานไม่สำเร็จ</p>';
    }
    if (productList) {
      productList.innerHTML = '<p class="no-data">❌ โหลดรายงานไม่สำเร็จ</p>';
    }
    showToast('เกิดข้อผิดพลาดในการโหลดรายงาน', 'error');
  }
}

function renderReportData(data, period, date, month) {
  const factoryItems = Array.isArray(data.byFactory) ? data.byFactory : [];
  const productItems = Array.isArray(data.byProduct) ? data.byProduct : [];

  renderReportList('factory-report-list', factoryItems, item => {
    return item.group_key ? `โรง ${item.group_key}` : 'ไม่ระบุโรงงาน';
  });

  renderReportList('product-report-list', productItems, item => {
    return item.group_key ? String(item.group_key) : 'ไม่ระบุรหัส';
  });

  const periodOrders = factoryItems.reduce((sum, item) => sum + (item.order_count || 0), 0);
  const periodCement = factoryItems.reduce((sum, item) => sum + (item.total_cement || 0), 0);

  const topFactory = getTopItem(factoryItems);
  const topProduct = getTopItem(productItems);

  const periodOrdersElement = document.getElementById('period-orders');
  if (periodOrdersElement) {
    periodOrdersElement.textContent = periodOrders.toLocaleString();
  }

  const periodCementElement = document.getElementById('period-cement');
  if (periodCementElement) {
    periodCementElement.textContent = periodCement ? periodCement.toFixed(2) : '0.00';
  }

  const activeFactories = document.getElementById('active-factories');
  if (activeFactories) {
    activeFactories.textContent = factoryItems.length.toLocaleString();
  }

  const activeProducts = document.getElementById('active-products');
  if (activeProducts) {
    activeProducts.textContent = productItems.length.toLocaleString();
  }

  const topFactoryElement = document.getElementById('top-factory');
  if (topFactoryElement) {
    topFactoryElement.textContent = topFactory
      ? (topFactory.group_key ? `โรง ${topFactory.group_key}` : 'ไม่ระบุโรงงาน')
      : '-';
  }

  const topProductElement = document.getElementById('top-product');
  if (topProductElement) {
    topProductElement.textContent = topProduct
      ? (topProduct.group_key ? String(topProduct.group_key) : 'ไม่ระบุรหัส')
      : '-';
  }

  const avgCementElement = document.getElementById('avg-cement');
  if (avgCementElement) {
    const avgCement = periodOrders > 0 ? periodCement / periodOrders : 0;
    avgCementElement.textContent = avgCement.toFixed(2);
  }

  const reportRange = document.getElementById('report-range');
  if (reportRange) {
    if (period === 'monthly') {
      reportRange.textContent = `ข้อมูลรายเดือน ${formatMonth(month)}`;
    } else {
      reportRange.textContent = `ข้อมูลรายวัน ${formatDate(date)}`;
    }
  }
}

function renderReportList(containerId, items, labelFormatter) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!items || items.length === 0) {
    container.innerHTML = '<p class="no-data">ไม่มีข้อมูล</p>';
    return;
  }

  const sortedItems = [...items].sort((a, b) => (b.total_cement || 0) - (a.total_cement || 0));
  const maxCement = Math.max(...sortedItems.map(item => item.total_cement || 0), 1);

  container.innerHTML = sortedItems.map(item => {
    const cement = item.total_cement || 0;
    const orderCount = item.order_count || 0;
    const label = escapeHtml(labelFormatter(item));
    const width = Math.round((cement / maxCement) * 100);

    return `
      <div class="report-item">
        <div class="report-meta">
          <span class="report-label">${label}</span>
          <span class="report-value">${cement.toFixed(2)} คิว</span>
        </div>
        <div class="report-bar"><span style="width: ${width}%"></span></div>
        <div class="report-sub">${orderCount} รายการ</div>
      </div>
    `;
  }).join('');
}

function getTopItem(items) {
  if (!items || items.length === 0) return null;
  return items.reduce((top, item) => {
    const current = item.total_cement || 0;
    const topValue = top?.total_cement || 0;
    return current > topValue ? item : top;
  }, null);
}

/**
 * Pagination
 */
function updatePagination() {
  const totalPages = Math.ceil(totalOrders / pageSize);
  const pageInfo = document.getElementById('page-info');
  if (pageInfo) {
    pageInfo.textContent = `หน้า ${currentPage} / ${totalPages || 1}`;
  }

  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  if (prevBtn) {
    prevBtn.disabled = currentPage <= 1;
  }
  if (nextBtn) {
    nextBtn.disabled = currentPage >= totalPages;
  }
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
 * Reset order filters
 */
function resetFilters() {
  const dateFilter = document.getElementById('date-filter');
  const factoryFilter = document.getElementById('factory-filter');
  const productFilter = document.getElementById('product-filter');

  if (dateFilter) dateFilter.value = '';
  if (factoryFilter) factoryFilter.value = '';
  if (productFilter) productFilter.value = '';

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
      loadOrders();
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
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast show ${type}`;

  setTimeout(() => {
    toast.className = 'toast';
  }, 3000);
}

function setLastUpdated() {
  const lastUpdated = document.getElementById('last-updated');
  if (!lastUpdated) return;
  lastUpdated.textContent = formatDateTime(new Date());
}

/**
 * Utility functions
 */
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const [year, month, day] = dateStr.split('-');
  return `${parseInt(day, 10)}/${parseInt(month, 10)}/${parseInt(year, 10) + 543}`;
}

function formatMonth(monthStr) {
  if (!monthStr) return '-';
  const [year, month] = monthStr.split('-');
  return `${parseInt(month, 10)}/${parseInt(year, 10) + 543}`;
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString('th-TH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
