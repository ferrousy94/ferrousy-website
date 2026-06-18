// =============================================
// 🔧 FIREBASE CONFIG — Replace with your values
// =============================================
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyAcqf0_kjKegy2KP1M1UnVJ9KP8uxtoXTQ",
    authDomain: "whatpeoplepaid.firebaseapp.com",
    projectId: "whatpeoplepaid",
    storageBucket: "whatpeoplepaid.firebasestorage.app",
    messagingSenderId: "403309292239",
    appId: "1:403309292239:web:b26b21f2c9c7c85698a5ba"
};
// =============================================

// Firebase SDK imports (CDN)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    deleteDoc,
    doc,
    query,
    orderBy,
    limit,
    onSnapshot,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";
import {
    getAuth,
    signInWithPopup,
    GoogleAuthProvider,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";

import { carData } from "./cars.js";

// Initialize Firebase
const app = initializeApp(FIREBASE_CONFIG);
const db = getFirestore(app);
const auth = getAuth(app);

const ADMIN_EMAIL = "a5daniel@uwaterloo.ca";

// =============================================
// State
// =============================================
let allSubmissions = [];
let currentSort = { field: 'submittedAt', direction: 'desc' };
let filters = { make: '', condition: '', province: '' };
let currentUser = null;

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
const inputModel = document.getElementById('input-model');
const customModelGroup = document.getElementById('custom-model-group');
const inputCustomModel = document.getElementById('input-custom-model');

const inputYear = document.getElementById('input-year');
const tableBody = document.getElementById('table-body');
const filterMake = document.getElementById('filter-make');
const filterCondition = document.getElementById('filter-condition');
const filterProvince = document.getElementById('filter-province');

// Auth DOM
const btnShowLogin = document.getElementById('btn-show-login');
const btnLogout = document.getElementById('btn-logout');
const userProfile = document.getElementById('user-profile');
const userEmail = document.getElementById('user-email');
const authModal = document.getElementById('auth-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnGoogleLogin = document.getElementById('btn-google-login');
const emailAuthForm = document.getElementById('email-auth-form');
const authEmailInput = document.getElementById('auth-email');
const authPasswordInput = document.getElementById('auth-password');
const btnEmailLogin = document.getElementById('btn-email-login');
const btnEmailRegister = document.getElementById('btn-email-register');
const authError = document.getElementById('auth-error');
const submitAuthWarning = document.getElementById('submit-auth-warning');
const linkShowLogin = document.getElementById('link-show-login');

// =============================================
// Initialize
// =============================================
function init() {
    populateMakes();
    populateYears();
    setDefaultDate();
    setupEventListeners();
    setupAuthListeners();
    listenToSubmissions();
}

function populateMakes() {
    const makes = Object.keys(carData).sort();
    makes.forEach(make => {
        const opt = document.createElement('option');
        opt.value = make;
        opt.textContent = make;
        inputMake.appendChild(opt);
    });
    const otherOpt = document.createElement('option');
    otherOpt.value = "__other__";
    otherOpt.textContent = "Other (type below)";
    inputMake.appendChild(otherOpt);
}

function updateModels() {
    const make = inputMake.value;
    inputModel.innerHTML = '<option value="">Select Model</option>';
    
    if (!make || make === '__other__') {
        inputModel.disabled = true;
        customModelGroup.style.display = 'block';
        inputCustomModel.required = true;
    } else {
        inputModel.disabled = false;
        const models = carData[make] || [];
        models.forEach(model => {
            const opt = document.createElement('option');
            opt.value = model;
            opt.textContent = model;
            inputModel.appendChild(opt);
        });
        const otherOpt = document.createElement('option');
        otherOpt.value = "__other__";
        otherOpt.textContent = "Other (type below)";
        inputModel.appendChild(otherOpt);
        
        customModelGroup.style.display = 'none';
        inputCustomModel.required = false;
        inputCustomModel.value = '';
    }
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

function setupAuthListeners() {
    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        if (user) {
            btnShowLogin.style.display = 'none';
            userProfile.style.display = 'block';
            userEmail.textContent = user.email;
            
            submitAuthWarning.style.display = 'none';
            submitToggle.style.display = 'block';
            authModal.style.display = 'none';
        } else {
            btnShowLogin.style.display = 'block';
            userProfile.style.display = 'none';
            
            submitAuthWarning.style.display = 'block';
            submitToggle.style.display = 'none';
            submitForm.style.display = 'none';
        }
        renderTable(); // Re-render for admin delete buttons
    });
}

function setupEventListeners() {
    // Auth Modal
    const showModal = (e) => { e.preventDefault(); authModal.style.display = 'flex'; authError.textContent = ''; };
    btnShowLogin.addEventListener('click', showModal);
    linkShowLogin.addEventListener('click', showModal);
    btnCloseModal.addEventListener('click', () => authModal.style.display = 'none');
    
    // Auth Actions
    btnLogout.addEventListener('click', () => signOut(auth));
    
    btnGoogleLogin.addEventListener('click', async () => {
        try {
            const provider = new GoogleAuthProvider();
            await signInWithPopup(auth, provider);
        } catch (error) {
            authError.textContent = error.message;
        }
    });

    btnEmailLogin.addEventListener('click', async (e) => {
        e.preventDefault();
        if(!emailAuthForm.checkValidity()) { emailAuthForm.reportValidity(); return; }
        try {
            await signInWithEmailAndPassword(auth, authEmailInput.value, authPasswordInput.value);
        } catch (error) {
            authError.textContent = error.message;
        }
    });

    btnEmailRegister.addEventListener('click', async (e) => {
        e.preventDefault();
        if(!emailAuthForm.checkValidity()) { emailAuthForm.reportValidity(); return; }
        try {
            await createUserWithEmailAndPassword(auth, authEmailInput.value, authPasswordInput.value);
        } catch (error) {
            authError.textContent = error.message;
        }
    });

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

    // Make & Model dropdowns
    inputMake.addEventListener('change', () => {
        if (inputMake.value === '__other__') {
            customMakeGroup.style.display = 'block';
            inputCustomMake.required = true;
        } else {
            customMakeGroup.style.display = 'none';
            inputCustomMake.required = false;
            inputCustomMake.value = '';
        }
        updateModels();
    });

    inputModel.addEventListener('change', () => {
        if (inputModel.value === '__other__') {
            customModelGroup.style.display = 'block';
            inputCustomModel.required = true;
        } else {
            customModelGroup.style.display = 'none';
            inputCustomModel.required = false;
            inputCustomModel.value = '';
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
        tableBody.innerHTML = `<tr><td colspan="11" class="table-empty">
            Unable to load data. Please check Firebase configuration.
        </td></tr>`;
    });
}

// =============================================
// Firestore: Submit new entry
// =============================================
async function handleSubmit(e) {
    e.preventDefault();
    if (!currentUser) return;

    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Submitting...';
    formMessage.textContent = '';

    const make = inputMake.value === '__other__' ? inputCustomMake.value.trim() : inputMake.value;
    const model = (inputMake.value === '__other__' || inputModel.value === '__other__') ? inputCustomModel.value.trim() : inputModel.value;

    if (!make || !model) {
        formMessage.textContent = 'Please enter a car make and model.';
        formMessage.className = 'form-message error';
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Submit';
        return;
    }

    const data = {
        category: 'car',
        make: make,
        model: model,
        year: parseInt(inputYear.value),
        trim: document.getElementById('input-trim').value.trim() || null,
        condition: document.getElementById('input-condition').value,
        pricePaid: parseFloat(document.getElementById('input-price').value),
        msrp: document.getElementById('input-msrp').value
            ? parseFloat(document.getElementById('input-msrp').value)
            : null,
        province: document.getElementById('input-province').value,
        date: document.getElementById('input-date').value,
        submittedAt: serverTimestamp()
        // Note: We deliberately do NOT store currentUser.uid or email to maintain true anonymity.
        // Even if the DB is compromised, submissions cannot be traced back to the user account.
    };

    try {
        await addDoc(collection(db, 'prices'), data);
        formMessage.textContent = '✓ Thanks! Your submission has been added.';
        formMessage.className = 'form-message success';
        submitForm.reset();
        setDefaultDate();
        customMakeGroup.style.display = 'none';
        customModelGroup.style.display = 'none';
        inputModel.innerHTML = '<option value="">Select Make First</option>';
        inputModel.disabled = true;

        setTimeout(() => {
            submitForm.style.display = 'none';
            submitToggle.style.display = 'block';
            formMessage.textContent = '';
        }, 2000);
    } catch (err) {
        console.error('Submit error:', err);
        formMessage.textContent = 'Error submitting. Ensure you are logged in and have permission.';
        formMessage.className = 'form-message error';
    }

    btnSubmit.disabled = false;
    btnSubmit.textContent = 'Submit';
}

// =============================================
// Admin Delete
// =============================================
window.deleteRecord = async function(id) {
    if (!confirm("Are you sure you want to delete this record?")) return;
    try {
        await deleteDoc(doc(db, 'prices', id));
    } catch (error) {
        console.error("Error deleting document: ", error);
        alert("Failed to delete. Check your permissions.");
    }
};

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
    const isAdmin = currentUser && currentUser.email === ADMIN_EMAIL;

    // Check if the admin th exists, if not, create it
    let thead = document.querySelector('.data-table thead tr');
    let hasAdminTh = thead.querySelector('.admin-col');
    if (isAdmin && !hasAdminTh) {
        let th = document.createElement('th');
        th.className = 'admin-col';
        th.style.width = '40px';
        thead.appendChild(th);
    } else if (!isAdmin && hasAdminTh) {
        hasAdminTh.remove();
    }

    if (sorted.length === 0) {
        const colSpan = isAdmin ? 11 : 10;
        tableBody.innerHTML = `<tr><td colspan="${colSpan}" class="table-empty">
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
        
        let row = `<tr>
            <td><strong>${escapeHtml(s.make || '')}</strong></td>
            <td>${escapeHtml(s.model || '')}</td>
            <td>${s.year || '—'}</td>
            <td>${escapeHtml(s.trim || '—')}</td>
            <td><span class="condition-badge ${condClass}">${condLabel}</span></td>
            <td class="price-cell">${price}</td>
            <td class="price-cell" style="color: var(--text-muted);">${msrp}</td>
            <td>${savings}</td>
            <td>${s.province || '—'}</td>
            <td style="color: var(--text-muted);">${s.date || '—'}</td>`;
            
        if (isAdmin) {
            row += `<td><button class="btn-delete" onclick="deleteRecord('${s.id}')" title="Delete Record">🗑️</button></td>`;
        }
        
        row += `</tr>`;
        return row;
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
