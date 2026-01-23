/**
 * PCC-MO Shared Utilities
 * Common functions used across all pages
 */

// ===============================================
// API HELPERS
// ===============================================
const API_BASE = '';

async function fetchAPI(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`API Error [${endpoint}]:`, error);
        throw error;
    }
}

async function fetchOrders(filters = {}, limit = 20, offset = 0) {
    const params = new URLSearchParams({ limit, offset });
    appendFiltersToParams(params, filters);
    return fetchAPI(`/api/orders?${params}`);
}

async function fetchAnalytics(filters = {}, period = 'daily') {
    const params = new URLSearchParams({ period });
    appendFiltersToParams(params, filters);
    return fetchAPI(`/api/analytics?${params}`);
}

async function fetchFilterOptions() {
    return fetchAPI('/api/filters');
}

async function syncToSheets() {
    return fetchAPI('/api/sync', { method: 'POST' });
}

function appendFiltersToParams(params, filters) {
    if (!filters) return;

    if (filters.startDate) params.set('startDate', filters.startDate);
    if (filters.endDate) params.set('endDate', filters.endDate);

    if (filters.factoryIds?.length) {
        params.set('factoryIds', filters.factoryIds.join(','));
    }
    if (filters.productCodes?.length) {
        params.set('productCodes', filters.productCodes.join(','));
    }
    if (filters.supervisors?.length) {
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

// ===============================================
// DATE FORMATTING (Thai Locale)
// ===============================================
const thaiMonths = [
    'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
];

const thaiMonthsFull = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;

    const day = d.getDate();
    const month = thaiMonths[d.getMonth()];
    const year = d.getFullYear() + 543; // Buddhist Era

    return `${day} ${month} ${year}`;
}

function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;

    // ใช้ timezone Asia/Bangkok เพื่อให้แสดงเวลาไทยถูกต้อง
    const options = { timeZone: 'Asia/Bangkok' };
    const day = d.toLocaleString('en-US', { ...options, day: 'numeric' });
    const monthIdx = parseInt(d.toLocaleString('en-US', { ...options, month: 'numeric' })) - 1;
    const year = parseInt(d.toLocaleString('en-US', { ...options, year: 'numeric' })) + 543;
    const hours = d.toLocaleString('en-US', { ...options, hour: '2-digit', hour12: false }).padStart(2, '0');
    const mins = d.toLocaleString('en-US', { ...options, minute: '2-digit' }).padStart(2, '0');

    return `${day} ${thaiMonths[monthIdx]} ${year} ${hours}:${mins}`;
}

function formatMonth(dateStr) {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if (parts.length < 2) return dateStr;

    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[0], 10) + 543;

    return `${thaiMonthsFull[month]} ${year}`;
}

function formatPeriodKey(key, period) {
    if (!key) return '-';

    if (period === 'monthly') {
        const parts = key.split('-');
        if (parts.length === 2) {
            const month = parseInt(parts[1], 10) - 1;
            return thaiMonths[month] + ' ' + (parseInt(parts[0], 10) + 543);
        }
        return key;
    }

    return formatDate(key);
}

function toISODate(date) {
    if (!date) return '';
    if (typeof date === 'string') return date;

    // ใช้ timezone Asia/Bangkok
    const options = { timeZone: 'Asia/Bangkok' };
    const y = parseInt(date.toLocaleString('en-US', { ...options, year: 'numeric' }));
    const m = String(parseInt(date.toLocaleString('en-US', { ...options, month: 'numeric' }))).padStart(2, '0');
    const d = String(parseInt(date.toLocaleString('en-US', { ...options, day: 'numeric' }))).padStart(2, '0');

    return `${y}-${m}-${d}`;
}

function getDateRangePreset(preset) {
    // สร้าง Date object ที่ใช้เวลาไทย
    const nowStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' });
    const today = new Date(nowStr);
    let start = new Date(today);

    switch (preset) {
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

    return {
        start: toISODate(start),
        end: toISODate(today)
    };
}

// ===============================================
// NUMBER FORMATTING
// ===============================================
function formatNumber(num, decimals = 0) {
    if (num === null || num === undefined) return '-';
    const n = Number(num);
    if (!Number.isFinite(n)) return '-';

    return n.toLocaleString('th-TH', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

function formatDecimal(num) {
    return formatNumber(num, 2);
}

function formatPercent(num) {
    if (num === null || num === undefined) return '-';
    return Math.round(num) + '%';
}

// ===============================================
// DOM HELPERS
// ===============================================
function $(selector) {
    return document.querySelector(selector);
}

function $$(selector) {
    return document.querySelectorAll(selector);
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function setHtml(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
}

function getInputValue(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
}

function setInputValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value ?? '';
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ===============================================
// NAVIGATION
// ===============================================
function initNavigation() {
    const currentPath = window.location.pathname;
    const navItems = document.querySelectorAll('.nav-item');

    navItems.forEach(item => {
        const href = item.getAttribute('href');
        const isActive = (currentPath === href) ||
            (currentPath === '/' && href === '/') ||
            (currentPath.startsWith(href) && href !== '/');

        item.classList.toggle('active', isActive);
    });

    // Mobile menu toggle
    const menuBtn = document.getElementById('menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('mobile-overlay');

    function closeMobileMenu() {
        if (sidebar) sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('show');
    }

    function openMobileMenu() {
        if (sidebar) sidebar.classList.add('open');
        if (overlay) overlay.classList.add('show');
    }

    if (menuBtn) {
        menuBtn.addEventListener('click', () => {
            if (sidebar && sidebar.classList.contains('open')) {
                closeMobileMenu();
            } else {
                openMobileMenu();
            }
        });
    }

    if (overlay) {
        overlay.addEventListener('click', closeMobileMenu);
    }

    // Close menu on nav item click (mobile)
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                closeMobileMenu();
            }
        });
    });
}

// ===============================================
// TOAST NOTIFICATIONS
// ===============================================
let toastTimeout = null;

function showToast(message, type = 'info', duration = 4000) {
    const toast = document.getElementById('toast');
    if (!toast) return;

    if (toastTimeout) {
        clearTimeout(toastTimeout);
    }

    toast.textContent = message;
    toast.className = `toast ${type} show`;

    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

// ===============================================
// CHIP FILTERS
// ===============================================
function renderChipGroup(containerId, items, labelFormatter) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!items || items.length === 0) {
        container.innerHTML = '<span class="text-muted">ไม่มีข้อมูล</span>';
        return;
    }

    container.innerHTML = items.map(item => {
        const value = escapeHtml(String(item));
        const label = escapeHtml(labelFormatter ? labelFormatter(item) : String(item));
        return `
      <label class="chip">
        <input type="checkbox" class="chip-checkbox" value="${value}">
        <span class="chip-label">${label}</span>
      </label>
    `;
    }).join('');

    // Add click handlers
    container.querySelectorAll('.chip').forEach(chip => {
        const checkbox = chip.querySelector('.chip-checkbox');
        chip.addEventListener('click', (e) => {
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
            }
            chip.classList.toggle('active', checkbox.checked);
        });
    });
}

function getSelectedChips(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return [];

    return Array.from(container.querySelectorAll('.chip-checkbox:checked'))
        .map(input => input.value);
}

function clearChipSelection(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.querySelectorAll('.chip-checkbox').forEach(cb => {
        cb.checked = false;
    });
    container.querySelectorAll('.chip').forEach(chip => {
        chip.classList.remove('active');
    });
}

// ===============================================
// CHART HELPERS
// ===============================================
function renderBarChart(containerId, items, labelFormatter) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!items || items.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><p class="empty-text">ไม่มีข้อมูล</p></div>';
        return;
    }

    const sorted = [...items].sort((a, b) => (b.total_cement || 0) - (a.total_cement || 0));
    const displayItems = sorted.slice(0, 6);
    const maxValue = Math.max(...displayItems.map(item => Number(item.total_cement || 0)), 1);

    container.innerHTML = displayItems.map(item => {
        const value = Number(item.total_cement || 0);
        const width = Math.round((value / maxValue) * 100);
        const label = escapeHtml(labelFormatter ? labelFormatter(item.group_key) : String(item.group_key || 'ไม่ระบุ'));
        const orders = formatNumber(item.order_count || 0);

        return `
      <div class="bar-item">
        <div class="bar-header">
          <span class="bar-label">${label}</span>
          <span class="bar-value">${formatDecimal(value)} คิว</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width: ${width}%"></div>
        </div>
        <div class="text-muted" style="font-size: 0.8rem">${orders} รายการ</div>
      </div>
    `;
    }).join('');
}

function renderDonutChart(containerId, syncedPercent) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.style.setProperty('background', `conic-gradient(var(--color-secondary) 0 ${syncedPercent}%, var(--color-primary-muted) ${syncedPercent}% 100%)`);

    const center = container.querySelector('.donut-center');
    if (center) {
        center.textContent = `${syncedPercent}%`;
    }
}

function renderTrendChart(containerId, series, period) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!series || series.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">📈</div><p class="empty-text">ไม่มีข้อมูลแนวโน้ม</p></div>';
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
    const firstLabel = formatPeriodKey(series[0].period_key, period);
    const lastLabel = formatPeriodKey(series[series.length - 1].period_key, period);

    container.innerHTML = `
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width: 100%; height: 160px;">
      <defs>
        <linearGradient id="trend-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(28, 141, 162, 0.4)"></stop>
          <stop offset="100%" stop-color="rgba(28, 141, 162, 0)"></stop>
        </linearGradient>
      </defs>
      <polygon points="${areaPoints}" fill="url(#trend-gradient)"></polygon>
      <polyline points="${points}" fill="none" stroke="var(--color-secondary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></polyline>
    </svg>
    <div class="flex-between text-muted" style="font-size: 0.8rem">
      <span>${escapeHtml(firstLabel)}</span>
      <span>${escapeHtml(lastLabel)}</span>
    </div>
  `;
}

// ===============================================
// INITIALIZATION
// ===============================================
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
});

// Export for use in other modules
window.PCCMO = {
    fetchAPI,
    fetchOrders,
    fetchAnalytics,
    fetchFilterOptions,
    syncToSheets,
    formatDate,
    formatDateTime,
    formatMonth,
    formatPeriodKey,
    toISODate,
    getDateRangePreset,
    formatNumber,
    formatDecimal,
    formatPercent,
    $,
    $$,
    setText,
    setHtml,
    getInputValue,
    setInputValue,
    escapeHtml,
    showToast,
    renderChipGroup,
    getSelectedChips,
    clearChipSelection,
    renderBarChart,
    renderDonutChart,
    renderTrendChart
};
