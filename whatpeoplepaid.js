// =============================================
// 🔧 FIREBASE CONFIG — Replace with your values
// =============================================
// To get these values:
// 1. Go to https://console.firebase.google.com
// 2. Select your project (ferrousy-website)
// 3. Click the gear icon → Project Settings
// 4. Scroll to "Your apps" → Web app config
const FIREBASE_CONFIG = {
    apiKey: "YOUR_API_KEY",
    authDomain: "ferrousy-website.firebaseapp.com",
    projectId: "ferrousy-website",
    storageBucket: "ferrousy-website.firebasestorage.app",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};
// =============================================

// Firebase SDK imports (CDN)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    query,
    orderBy,
    limit,
    onSnapshot,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";

// Initialize Firebase
const app = initializeApp(FIREBASE_CONFIG);
const db = getFirestore(app);

// =============================================
// State
// =============================================
let allSubmissions = [];
let currentSort = { field: 'submittedAt', direction: 'desc' };
let filters = { make: '', condition: '', province: '' };

// =============================================
// DOM Elements
// =============================================
const submitToggle = document.getElementById('submit-toggle');
const submitForm = document.getElementById('submit-form');
const btnCancel = document.getElementById('btn-cancel');
const btnSubmit = document.getElementById('btn-submit');
const formMessage = document.getElementById('form-message');
const inputMake = document.getElementById('input-make');
const customMakeGroup = document.getElementById('custom-make-group');
const inputCustomMake = document.getElementById('input-custom-make');
const inputYear = document.getElementById('input-year');
const tableBody = document.getElementById('table-body');
const filterMake = document.getElementById('filter-make');
const filterCondition = document.getElementById('filter-condition');
const filterProvince = document.getElementById('filter-province');

// =============================================
// Initialize
// =============================================
function init() {
    populateYears();
    setDefaultDate();
    setupEventListeners();
    listenToSubmissions();
}

function populateYears() {
    const currentYear = new Date().getFullYear();
    for (let y = currentYear + 1; y >= 2000; y--) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        inputYear.appendChild(opt);
    }
}

function setDefaultDate() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    document.getElementById('input-date').value = `${now.getFullYear()}-${month}`;
}

function setupEventListeners() {
    // Toggle form
    submitToggle.addEventListener('click', () => {
        submitForm.style.display = submitForm.style.display === 'none' ? 'block' : 'none';
        submitToggle.style.display = submitForm.style.display === 'none' ? 'block' : 'none';
    });

    btnCancel.addEventListener('click', () => {
        submitForm.style.display = 'none';
        submitToggle.style.display = 'block';
        formMessage.textContent = '';
    });

    // Custom make toggle
    inputMake.addEventListener('change', () => {
        if (inputMake.value === '__other__') {
            customMakeGroup.style.display = 'block';
            inputCustomMake.required = true;
        } else {
            customMakeGroup.style.display = 'none';
            inputCustomMake.required = false;
            inputCustomMake.value = '';
        }
    });

    // Form submit
    submitForm.addEventListener('submit', handleSubmit);

    // Filters
    filterMake.addEventListener('change', applyFilters);
    filterCondition.addEventListener('change', applyFilters);
    filterProvince.addEventListener('change', applyFilters);

    // Sortable columns
    document.querySelectorAll('.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const field = th.dataset.sort;
            if (currentSort.field === field) {
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.field = field;
                currentSort.direction = 'asc';
            }
            document.querySelectorAll('.sortable').forEach(el => el.classList.remove('sort-active'));
            th.classList.add('sort-active');
            renderTable();
        });
    });
}

// =============================================
// Firestore: Listen to submissions (real-time)
// =============================================
function listenToSubmissions() {
    const q = query(
        collection(db, 'prices'),
        orderBy('submittedAt', 'desc'),
        limit(500)
    );

    onSnapshot(q, (snapshot) => {
        allSubmissions = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        updateMakeFilter();
        updateStats();
        renderTable();
    }, (error) => {
        console.error('Firestore listen error:', error);
        tableBody.innerHTML = `<tr><td colspan="10" class="table-empty">
            Unable to load data. Please check Firebase configuration.
        </td></tr>`;
    });
}

// =============================================
// Firestore: Submit new entry
// =============================================
async function handleSubmit(e) {
    e.preventDefault();
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Submitting...';
    formMessage.textContent = '';

    const make = inputMake.value === '__other__' ? inputCustomMake.value.trim() : inputMake.value;

    if (!make) {
        formMessage.textContent = 'Please enter a car make.';
        formMessage.className = 'form-message error';
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Submit';
        return;
    }

    const data = {
        category: 'car',
        make: make,
        model: document.getElementById('input-model').value.trim(),
        year: parseInt(document.getElementById('input-year').value),
        trim: document.getElementById('input-trim').value.trim() || null,
        condition: document.getElementById('input-condition').value,
        pricePaid: parseFloat(document.getElementById('input-price').value),
        msrp: document.getElementById('input-msrp').value
            ? parseFloat(document.getElementById('input-msrp').value)
            : null,
        province: document.getElementById('input-province').value,
        date: document.getElementById('input-date').value,
        submittedAt: serverTimestamp()
    };

    try {
        await addDoc(collection(db, 'prices'), data);
        formMessage.textContent = '✓ Thanks! Your submission has been added.';
        formMessage.className = 'form-message success';
        submitForm.reset();
        setDefaultDate();
        customMakeGroup.style.display = 'none';
        // Auto-hide form after success
        setTimeout(() => {
            submitForm.style.display = 'none';
            submitToggle.style.display = 'block';
            formMessage.textContent = '';
        }, 2000);
    } catch (err) {
        console.error('Submit error:', err);
        formMessage.textContent = 'Error submitting. Please try again.';
        formMessage.className = 'form-message error';
    }

    btnSubmit.disabled = false;
    btnSubmit.textContent = 'Submit';
}

// =============================================
// Update Stats
// =============================================
function updateStats() {
    const total = allSubmissions.length;
    document.getElementById('stat-total').textContent = total.toLocaleString();

    if (total === 0) {
        document.getElementById('stat-avg-price').textContent = '—';
        document.getElementById('stat-avg-discount').textContent = '—';
        return;
    }

    const avgPrice = allSubmissions.reduce((sum, s) => sum + (s.pricePaid || 0), 0) / total;
    document.getElementById('stat-avg-price').textContent = '$' + Math.round(avgPrice).toLocaleString();

    const withMsrp = allSubmissions.filter(s => s.msrp && s.msrp > 0);
    if (withMsrp.length > 0) {
        const avgDiscount = withMsrp.reduce((sum, s) => {
            return sum + ((s.msrp - s.pricePaid) / s.msrp * 100);
        }, 0) / withMsrp.length;
        const sign = avgDiscount >= 0 ? '-' : '+';
        document.getElementById('stat-avg-discount').textContent = sign + Math.abs(avgDiscount).toFixed(1) + '%';
    } else {
        document.getElementById('stat-avg-discount').textContent = '—';
    }
}

// =============================================
// Update Make Filter Dropdown
// =============================================
function updateMakeFilter() {
    const makes = [...new Set(allSubmissions.map(s => s.make))].sort();
    const currentValue = filterMake.value;
    filterMake.innerHTML = '<option value="">All Makes</option>';
    makes.forEach(make => {
        const opt = document.createElement('option');
        opt.value = make;
        opt.textContent = make;
        filterMake.appendChild(opt);
    });
    filterMake.value = currentValue;
}

// =============================================
// Filtering
// =============================================
function applyFilters() {
    filters.make = filterMake.value;
    filters.condition = filterCondition.value;
    filters.province = filterProvince.value;
    renderTable();
}

function getFilteredData() {
    return allSubmissions.filter(s => {
        if (filters.make && s.make !== filters.make) return false;
        if (filters.condition && s.condition !== filters.condition) return false;
        if (filters.province && s.province !== filters.province) return false;
        return true;
    });
}

// =============================================
// Sorting
// =============================================
function sortData(data) {
    const { field, direction } = currentSort;
    return [...data].sort((a, b) => {
        let valA = a[field];
        let valB = b[field];

        // Handle nulls
        if (valA == null) return 1;
        if (valB == null) return -1;

        // String comparison
        if (typeof valA === 'string') {
            valA = valA.toLowerCase();
            valB = (valB || '').toLowerCase();
        }

        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
        return 0;
    });
}

// =============================================
// Render Table
// =============================================
function renderTable() {
    const filtered = getFilteredData();
    const sorted = sortData(filtered);

    if (sorted.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="10" class="table-empty">
            No submissions yet. Be the first to share what you paid!
        </td></tr>`;
        return;
    }

    tableBody.innerHTML = sorted.map(s => {
        const price = s.pricePaid ? '$' + s.pricePaid.toLocaleString() : '—';
        const msrp = s.msrp ? '$' + s.msrp.toLocaleString() : '—';

        let savings = '—';
        if (s.msrp && s.pricePaid) {
            const diff = s.msrp - s.pricePaid;
            const pct = ((diff / s.msrp) * 100).toFixed(1);
            if (diff > 0) {
                savings = `<span class="savings-positive">-$${diff.toLocaleString()} (${pct}%)</span>`;
            } else if (diff < 0) {
                savings = `<span class="savings-negative">+$${Math.abs(diff).toLocaleString()} (${Math.abs(pct)}%)</span>`;
            } else {
                savings = 'MSRP';
            }
        }

        const condClass = s.condition === 'new' ? 'condition-new' : 'condition-used';
        const condLabel = s.condition === 'new' ? 'New' : 'Used';

        return `<tr>
            <td><strong>${escapeHtml(s.make || '')}</strong></td>
            <td>${escapeHtml(s.model || '')}</td>
            <td>${s.year || '—'}</td>
            <td>${escapeHtml(s.trim || '—')}</td>
            <td><span class="condition-badge ${condClass}">${condLabel}</span></td>
            <td class="price-cell">${price}</td>
            <td class="price-cell" style="color: var(--text-muted);">${msrp}</td>
            <td>${savings}</td>
            <td>${s.province || '—'}</td>
            <td style="color: var(--text-muted);">${s.date || '—'}</td>
        </tr>`;
    }).join('');
}

// =============================================
// Utility
// =============================================
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// =============================================
// Start
// =============================================
init();
