/**
 * PCC-MO Dashboard JavaScript
 */

let currentPage = 1;
const pageSize = 20;
let totalOrders = 0;
let currentFilters = {};

// DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  initFilterControls();
  setDefaultFilterDates();
  setDefaultComparison();
  fetchFilterOptions();
  applyFilters();
});

function initFilterControls() {
  const periodButtons = document.querySelectorAll('.segmented-btn');
  periodButtons.forEach(button => {
    button.addEventListener('click', () => {
      periodButtons.forEach(btn => {
        btn.classList.remove('is-active');
        btn.setAttribute('aria-pressed', 'false');
      });
      button.classList.add('is-active');
      button.setAttribute('aria-pressed', 'true');

      const periodInput = document.getElementById('analytics-period');
      if (periodInput) {
        periodInput.value = button.dataset.period || 'daily';
      }
    });
  });

  const quickButtons = document.querySelectorAll('.quick-range button');
  quickButtons.forEach(button => {
    button.addEventListener('click', () => {
      applyQuickRange(button.dataset.range);
    });
  });
}

function setDefaultFilterDates() {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1);

  setInputValue('filter-start', toISODate(start));
  setInputValue('filter-end', toISODate(today));
}

function setDefaultComparison() {
  const today = new Date();
  const currentStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const previousStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const previousEnd = new Date(today.getFullYear(), today.getMonth(), 0);

  setInputValue('compare-a-start', toISODate(currentStart));
  setInputValue('compare-a-end', toISODate(today));
  setInputValue('compare-b-start', toISODate(previousStart));
  setInputValue('compare-b-end', toISODate(previousEnd));
}

function applyQuickRange(range) {
  const today = new Date();
  let start = new Date(today);

  switch (range) {
    case 'today':
      start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      break;
    case '7d':
      start.setDate(today.getDate() - 6);
      break;
    case '30d':
      start.setDate(today.getDate() - 29);
      break;
    case 'month':
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      break;
    case 'quarter': {
      const quarter = Math.floor(today.getMonth() / 3);
      start = new Date(today.getFullYear(), quarter * 3, 1);
      break;
    }
    case 'year':
      start = new Date(today.getFullYear(), 0, 1);
      break;
    default:
      break;
  }

  setInputValue('filter-start', toISODate(start));
  setInputValue('filter-end', toISODate(today));
}

async function fetchFilterOptions() {
  try {
    const response = await fetch('/api/filters');
    const data = await response.json();

    renderOptionChips('factory-options', data.factories, value => `โรง ${value}`);
    renderOptionChips('product-options', data.products, value => String(value));
    renderOptionChips('supervisor-options', data.supervisors, value => String(value));
  } catch (error) {
    console.error('Error loading filter options:', error);
  }
}

function renderOptionChips(containerId, items, labelFormatter) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!items || items.length === 0) {
    container.innerHTML = '<span class="empty-tag">ไม่มีข้อมูล</span>';
    return;
  }

  container.innerHTML = items.map(item => {
    const value = escapeHtml(String(item));
    const label = escapeHtml(labelFormatter(item));
    return `
      <label class="chip-option">
        <input type="checkbox" value="${value}">
        <span>${label}</span>
      </label>
    `;
  }).join('');
}

function applyFilters() {
  currentFilters = getFilterState();
  currentPage = 1;
  loadAnalytics(currentFilters);
  loadOrders(currentFilters);
  updateActiveFilters(currentFilters);
  loadComparison();
}

function resetAdvancedFilters() {
  setDefaultFilterDates();

  const periodInput = document.getElementById('analytics-period');
  if (periodInput) {
    periodInput.value = 'daily';
  }

  const periodButtons = document.querySelectorAll('.segmented-btn');
  periodButtons.forEach(button => {
    const isDaily = button.dataset.period === 'daily';
    button.classList.toggle('is-active', isDaily);
    button.setAttribute('aria-pressed', isDaily ? 'true' : 'false');
  });

  setInputValue('sync-filter', '');
  setInputValue('cement-min', '');
  setInputValue('cement-max', '');
  setInputValue('loaded-min', '');
  setInputValue('loaded-max', '');
  setInputValue('diff-min', '');
  setInputValue('diff-max', '');
  setInputValue('line-group-filter', '');
  setInputValue('line-user-filter', '');
  setInputValue('text-search', '');

  clearChipSelections('factory-options');
  clearChipSelections('product-options');
  clearChipSelections('supervisor-options');

  applyFilters();
}

function clearChipSelections(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll('input[type="checkbox"]').forEach(input => {
    input.checked = false;
  });
}

function getFilterState() {
  return {
    startDate: getInputValue('filter-start'),
    endDate: getInputValue('filter-end'),
    period: getInputValue('analytics-period') || 'daily',
    factoryIds: getSelectedValues('factory-options'),
    productCodes: getSelectedValues('product-options'),
    supervisors: getSelectedValues('supervisor-options'),
    syncStatus: getInputValue('sync-filter'),
    minCement: getInputValue('cement-min'),
    maxCement: getInputValue('cement-max'),
    minLoaded: getInputValue('loaded-min'),
    maxLoaded: getInputValue('loaded-max'),
    minDifference: getInputValue('diff-min'),
    maxDifference: getInputValue('diff-max'),
    lineGroupIds: getInputValue('line-group-filter'),
    lineUserIds: getInputValue('line-user-filter'),
    search: getInputValue('text-search')
  };
}

function getSelectedValues(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return [];
  return Array.from(container.querySelectorAll('input[type="checkbox"]:checked'))
    .map(input => input.value);
}

async function loadAnalytics(filters) {
  try {
    const params = new URLSearchParams({ period: filters.period || 'daily' });
    appendFilters(params, filters);

    const response = await fetch(`/api/analytics?${params.toString()}`);
    const data = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    renderAnalytics(data, filters);
    setLastUpdated();
  } catch (error) {
    console.error('Error loading analytics:', error);
    showToast('เกิดข้อผิดพลาดในการโหลดรายงาน', 'error');
  }
}

function renderAnalytics(data, filters) {
  const totals = data.totals || {};
  const period = data.period || filters.period || 'daily';

  updateHeaderMetrics(totals);
  updateOverview(data, totals);
  updateInsightCards(data, totals);
  updateRangeLabels(filters, period);

  renderLineChart('trend-chart', data.timeSeries || [], period);
  renderBarChart('factory-chart', data.byFactory || [], value => {
    return value ? `โรง ${value}` : 'ไม่ระบุโรงงาน';
  });
  renderBarChart('product-chart', data.byProduct || [], value => {
    return value ? String(value) : 'ไม่ระบุรหัส';
  });
  renderBarChart('supervisor-chart', data.bySupervisor || [], value => {
    return value ? String(value) : 'ไม่ระบุผู้ควบคุม';
  });
  renderSyncChart(data.syncStatus || []);
}

function updateHeaderMetrics(totals) {
  const totalOrdersElement = document.getElementById('total-orders');
  if (totalOrdersElement) {
    totalOrdersElement.textContent = formatNumber(totals.order_count || 0);
  }

  const periodOrdersElement = document.getElementById('period-orders');
  if (periodOrdersElement) {
    periodOrdersElement.textContent = formatNumber(totals.order_count || 0);
  }

  const periodCementElement = document.getElementById('period-cement');
  if (periodCementElement) {
    periodCementElement.textContent = formatDecimal(totals.total_cement);
  }

  const avgCementElement = document.getElementById('avg-cement');
  if (avgCementElement) {
    avgCementElement.textContent = formatDecimal(totals.avg_cement);
  }
}

function updateOverview(data, totals) {
  const byFactory = data.byFactory || [];
  const byProduct = data.byProduct || [];
  const topFactory = getTopItem(byFactory);
  const topProduct = getTopItem(byProduct);

  const activeFactories = document.getElementById('active-factories');
  if (activeFactories) {
    activeFactories.textContent = formatNumber(byFactory.filter(item => item.group_key !== null && item.group_key !== '').length);
  }

  const activeProducts = document.getElementById('active-products');
  if (activeProducts) {
    activeProducts.textContent = formatNumber(byProduct.filter(item => item.group_key !== null && item.group_key !== '').length);
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
}

function updateInsightCards(data, totals) {
  const insightOrders = document.getElementById('insight-orders');
  if (insightOrders) {
    insightOrders.textContent = `${formatNumber(totals.order_count || 0)} รายการ`;
  }

  const insightLoaded = document.getElementById('insight-loaded');
  if (insightLoaded) {
    insightLoaded.textContent = `${formatDecimal(totals.total_loaded)} คิว`;
  }

  const insightDiff = document.getElementById('insight-diff');
  if (insightDiff) {
    insightDiff.textContent = `${formatDecimal(totals.total_difference)} คิว`;
  }

  const syncStatus = data.syncStatus || [];
  const syncedCount = getStatusCount(syncStatus, 1);
  const pendingCount = getStatusCount(syncStatus, 0);
  const total = syncedCount + pendingCount;
  const syncPercent = total > 0 ? Math.round((syncedCount / total) * 100) : 0;

  const insightSync = document.getElementById('insight-sync');
  if (insightSync) {
    insightSync.textContent = `${syncPercent}%`;
  }
}

function updateRangeLabels(filters, period) {
  const rangeText = buildRangeText(filters.startDate, filters.endDate, period);

  const reportRange = document.getElementById('report-range');
  if (reportRange) {
    reportRange.textContent = rangeText;
  }

  const analyticsRange = document.getElementById('analytics-range');
  if (analyticsRange) {
    analyticsRange.textContent = rangeText;
  }

  const periodLabel = document.getElementById('period-orders-label');
  if (periodLabel) {
    periodLabel.textContent = period === 'monthly' ? 'รายการรายเดือน' : 'รายการรายวัน';
  }
}

function renderLineChart(containerId, series, period) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!series || series.length === 0) {
    container.innerHTML = '<p class="no-data">ไม่มีข้อมูลแนวโน้ม</p>';
    return;
  }

  const values = series.map(item => Number(item.total_cement || 0));
  const maxValue = Math.max(...values, 1);
  const step = series.length > 1 ? 100 / (series.length - 1) : 100;
  const points = values.map((value, index) => {
    const x = (index * step).toFixed(2);
    const y = (100 - (value / maxValue) * 100).toFixed(2);
    return `${x},${y}`;
  }).join(' ');
  const areaPoints = `0,100 ${points} 100,100`;

  const firstLabel = formatPeriod(series[0].period_key, period);
  const lastLabel = formatPeriod(series[series.length - 1].period_key, period);

  container.innerHTML = `
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="trend-svg">
      <defs>
        <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(28, 141, 162, 0.35)"></stop>
          <stop offset="100%" stop-color="rgba(28, 141, 162, 0)"></stop>
        </linearGradient>
      </defs>
      <polygon points="${areaPoints}" fill="url(#trend-fill)"></polygon>
      <polyline points="${points}" fill="none" stroke="#1c8da2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></polyline>
    </svg>
    <div class="chart-axis">
      <span>${escapeHtml(firstLabel)}</span>
      <span>${escapeHtml(lastLabel)}</span>
    </div>
  `;
}

function renderBarChart(containerId, items, labelFormatter) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!items || items.length === 0) {
    container.innerHTML = '<p class="no-data">ไม่มีข้อมูล</p>';
    return;
  }

  const sorted = [...items].sort((a, b) => (b.total_cement || 0) - (a.total_cement || 0));
  const displayItems = sorted.slice(0, 8);
  const maxValue = Math.max(...displayItems.map(item => Number(item.total_cement || 0)), 1);

  container.innerHTML = displayItems.map(item => {
    const value = Number(item.total_cement || 0);
    const width = Math.round((value / maxValue) * 100);
    const label = escapeHtml(labelFormatter(item.group_key));
    const orders = formatNumber(item.order_count || 0);

    return `
      <div class="bar-row">
        <div class="bar-meta">
          <span>${label}</span>
          <span>${value.toFixed(2)} คิว</span>
        </div>
        <div class="bar-track"><span style="width: ${width}%"></span></div>
        <div class="bar-sub">${orders} รายการ</div>
      </div>
    `;
  }).join('');
}

function renderSyncChart(syncStatus) {
  const syncedCount = getStatusCount(syncStatus, 1);
  const pendingCount = getStatusCount(syncStatus, 0);
  const total = syncedCount + pendingCount;
  const percent = total > 0 ? Math.round((syncedCount / total) * 100) : 0;

  const chart = document.getElementById('sync-chart');
  if (chart) {
    chart.style.setProperty('--synced', `${percent}%`);
  }

  const center = document.getElementById('sync-center');
  if (center) {
    center.textContent = `${percent}%`;
  }

  const legend = document.getElementById('sync-legend');
  if (legend) {
    legend.innerHTML = `
      <span class="legend-item"><span class="legend-dot synced"></span>Synced ${formatNumber(syncedCount)}</span>
      <span class="legend-item"><span class="legend-dot pending"></span>Pending ${formatNumber(pendingCount)}</span>
    `;
  }
}

function getStatusCount(syncStatus, statusValue) {
  const entry = syncStatus.find(item => Number(item.status) === statusValue);
  return entry ? Number(entry.count || 0) : 0;
}

function getTopItem(items) {
  if (!items || items.length === 0) return null;
  return items.reduce((top, item) => {
    const current = item.total_cement || 0;
    const topValue = top?.total_cement || 0;
    return current > topValue ? item : top;
  }, null);
}

function buildRangeText(startDate, endDate, period) {
  if (!startDate && !endDate) return 'ช่วงข้อมูลทั้งหมด';
  if (startDate && endDate) {
    return period === 'monthly'
      ? `ช่วงข้อมูล ${formatMonth(startDate)} - ${formatMonth(endDate)}`
      : `ช่วงข้อมูล ${formatDate(startDate)} - ${formatDate(endDate)}`;
  }
  if (startDate) {
    return `ช่วงข้อมูลตั้งแต่ ${formatDate(startDate)}`;
  }
  return `ช่วงข้อมูลถึง ${formatDate(endDate)}`;
}

function updateActiveFilters(filters) {
  const container = document.getElementById('active-filters');
  if (!container) return;

  const chips = [];

  if (filters.startDate || filters.endDate) {
    chips.push(buildRangeText(filters.startDate, filters.endDate, filters.period || 'daily'));
  }

  if (filters.factoryIds && filters.factoryIds.length > 0) {
    chips.push(`โรงงาน: ${filters.factoryIds.join(', ')}`);
  }

  if (filters.productCodes && filters.productCodes.length > 0) {
    chips.push(`สินค้า: ${filters.productCodes.join(', ')}`);
  }

  if (filters.supervisors && filters.supervisors.length > 0) {
    chips.push(`หัวหน้าควบคุม: ${filters.supervisors.join(', ')}`);
  }

  if (filters.syncStatus === '1') {
    chips.push('สถานะ: Synced');
  } else if (filters.syncStatus === '0') {
    chips.push('สถานะ: Pending');
  }

  if (filters.minCement || filters.maxCement) {
    chips.push(`ปูน: ${filters.minCement || '0'} - ${filters.maxCement || '∞'} คิว`);
  }

  if (filters.minLoaded || filters.maxLoaded) {
    chips.push(`ปูนโหลด: ${filters.minLoaded || '0'} - ${filters.maxLoaded || '∞'} คิว`);
  }

  if (filters.minDifference || filters.maxDifference) {
    chips.push(`ส่วนต่าง: ${filters.minDifference || '0'} - ${filters.maxDifference || '∞'} คิว`);
  }

  if (filters.lineGroupIds) {
    chips.push(`กลุ่มไลน์: ${filters.lineGroupIds}`);
  }

  if (filters.lineUserIds) {
    chips.push(`ผู้ส่ง: ${filters.lineUserIds}`);
  }

  if (filters.search) {
    chips.push(`ค้นหา: ${filters.search}`);
  }

  if (chips.length === 0) {
    container.innerHTML = '<span class="chip">ไม่มีตัวกรอง</span>';
    return;
  }

  container.innerHTML = chips.map(text => `<span class="chip">${escapeHtml(text)}</span>`).join('');
}

/**
 * Load orders from API
 */
async function loadOrders(filters) {
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
    const params = new URLSearchParams({
      limit: pageSize,
      offset
    });
    appendFilters(params, filters);

    const response = await fetch(`/api/orders?${params.toString()}`);
    const data = await response.json();

    totalOrders = data.total || 0;

    renderOrders(data.orders || []);
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

function appendFilters(params, filters) {
  if (!filters) return;

  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);

  if (filters.factoryIds && filters.factoryIds.length > 0) {
    params.set('factoryIds', filters.factoryIds.join(','));
  }
  if (filters.productCodes && filters.productCodes.length > 0) {
    params.set('productCodes', filters.productCodes.join(','));
  }
  if (filters.supervisors && filters.supervisors.length > 0) {
    params.set('supervisors', filters.supervisors.join(','));
  }

  if (filters.syncStatus) params.set('synced', filters.syncStatus);
  if (filters.minCement) params.set('minCement', filters.minCement);
  if (filters.maxCement) params.set('maxCement', filters.maxCement);
  if (filters.minLoaded) params.set('minLoaded', filters.minLoaded);
  if (filters.maxLoaded) params.set('maxLoaded', filters.maxLoaded);
  if (filters.minDifference) params.set('minDifference', filters.minDifference);
  if (filters.maxDifference) params.set('maxDifference', filters.maxDifference);
  if (filters.lineGroupIds) params.set('lineGroupIds', filters.lineGroupIds);
  if (filters.lineUserIds) params.set('lineUserIds', filters.lineUserIds);
  if (filters.search) params.set('search', filters.search);
}

/**
 * Render orders to table
 */
function renderOrders(orders) {
  const tbody = document.getElementById('orders-tbody');
  if (!tbody) return;

  if (!orders || orders.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="no-data">ไม่พบข้อมูล</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = orders.map(order => {
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
  const ordersCount = document.getElementById('orders-count');
  if (ordersCount) {
    ordersCount.textContent = `ทั้งหมด ${formatNumber(totalOrders)} รายการ`;
  }
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
    loadOrders(currentFilters);
  }
}

function nextPage() {
  const totalPages = Math.ceil(totalOrders / pageSize);
  if (currentPage < totalPages) {
    currentPage++;
    loadOrders(currentFilters);
  }
}

/**
 * Comparison
 */
async function loadComparison() {
  const aStart = getInputValue('compare-a-start');
  const aEnd = getInputValue('compare-a-end');
  const bStart = getInputValue('compare-b-start');
  const bEnd = getInputValue('compare-b-end');

  if (!aStart || !aEnd || !bStart || !bEnd) {
    showToast('กรุณาเลือกช่วงเวลาให้ครบ', 'error');
    return;
  }

  try {
    const baseFilters = getFilterState();
    const [dataA, dataB] = await Promise.all([
      fetchAnalytics({ ...baseFilters, startDate: aStart, endDate: aEnd }),
      fetchAnalytics({ ...baseFilters, startDate: bStart, endDate: bEnd })
    ]);

    renderComparison(dataA, dataB);
  } catch (error) {
    console.error('Error loading comparison:', error);
    showToast('เกิดข้อผิดพลาดในการเปรียบเทียบ', 'error');
  }
}

async function fetchAnalytics(filters) {
  const params = new URLSearchParams({ period: filters.period || 'daily' });
  appendFilters(params, filters);

  const response = await fetch(`/api/analytics?${params.toString()}`);
  const data = await response.json();
  if (data.error) {
    throw new Error(data.error);
  }
  return data;
}

function renderComparison(dataA, dataB) {
  const totalsA = dataA.totals || {};
  const totalsB = dataB.totals || {};

  setText('compare-a-orders', `${formatNumber(totalsA.order_count || 0)} รายการ`);
  setText('compare-a-cement', `${formatDecimal(totalsA.total_cement)} คิว`);
  setText('compare-a-avg', `${formatDecimal(totalsA.avg_cement)} คิว`);

  setText('compare-b-orders', `${formatNumber(totalsB.order_count || 0)} รายการ`);
  setText('compare-b-cement', `${formatDecimal(totalsB.total_cement)} คิว`);
  setText('compare-b-avg', `${formatDecimal(totalsB.avg_cement)} คิว`);

  const diffOrders = (totalsA.order_count || 0) - (totalsB.order_count || 0);
  const diffCement = (totalsA.total_cement || 0) - (totalsB.total_cement || 0);
  const diffAvg = (totalsA.avg_cement || 0) - (totalsB.avg_cement || 0);

  setDiffText('compare-diff-orders', diffOrders, 'รายการ');
  setDiffText('compare-diff-cement', diffCement, 'คิว');
  setDiffText('compare-diff-avg', diffAvg, 'คิว');
}

function setDiffText(id, value, unit) {
  const element = document.getElementById(id);
  if (!element) return;
  const isPositive = value >= 0;
  element.classList.toggle('compare-diff', true);
  element.classList.toggle('positive', isPositive);
  element.classList.toggle('negative', !isPositive);
  element.textContent = `${value >= 0 ? '+' : ''}${formatDecimal(value)} ${unit}`;
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
      loadOrders(currentFilters);
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

function setInputValue(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.value = value;
  }
}

function getInputValue(id) {
  const element = document.getElementById(id);
  return element ? element.value.trim() : '';
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function toISODate(date) {
  return date.toISOString().split('T')[0];
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  return number.toLocaleString();
}

function formatDecimal(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0.00';
  return number.toFixed(2);
}

function formatPeriod(value, period) {
  if (!value) return '-';
  if (period === 'monthly') {
    return formatMonth(value);
  }
  return formatDate(value);
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
  if (text === undefined || text === null) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
