/* ==========================================
   🌊 BÍ KÍP AQUA DUBAI: CẤU HÌNH FIREBASE 🌊
   ========================================== */

const firebaseConfig = {
  apiKey: "AIzaSyDj2nKaJAl9C2AoJReqv4VbPhw5CMIftEg",
  authDomain: "text-library.firebaseapp.com",
  projectId: "text-library",
  storageBucket: "text-library.firebasestorage.app",
  messagingSenderId: "856649472604",
  appId: "1:856649472604:web:e76b104f1e7e7b0a28a499",
  measurementId: "G-QC3NQWPXP2"
};

// Khởi tạo Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

/* ========================================== */

const UI_CONFIG = {
    SHEETS: { folder: 'Folder', profile: 'Profile', period: 'Period', doctype: 'DocType', org: 'Organization' },
    L1_COLUMNS: [
        { label: "Hồ Sơ", key: "foldername", width: "60%" },
        { label: "Ghi Chú", key: "note", width: "40%" }
    ],
    L3_COLUMNS: [
        { label: "", key: "download", width: "50px" },
        { label: "Số Ký Hiệu", key: "symbolstring", width: "130px" },
        { label: "Ngày Ban Hành", key: "promulgatedate", width: "120px" },
        { label: "Trích Yếu Nội Dung", key: "abstract", width: "250px" },
        { label: "Cơ Quan Ban Hành", key: "organizationid", width: "180px" },
        { label: "ID Hồ sơ", key: "profileid", width: "120px" },
        { label: "Loại Văn Bản", key: "doctypeid", width: "130px" },
        { label: "Người Ký", key: "accountsigner", width: "120px" },
        { label: "Giai Đoạn", key: "periodid", width: "130px" },
        { label: "File ID", key: "fileid", width: "120px" },
        { label: "Người cập nhật", key: "accountupdate", width: "120px" },
        { label: "Thời điểm cập nhật", key: "timeupdate", width: "150px" }
    ]
};

const SPREADSHEET_ID = '1W9UGPV9g_WmKHFsD2DRB5_aj3dHmZ_AySAyhC5xtnz0';
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwQWw3qNVoKGTIBTXK8jZqu-qG3dFW3fFHPldyGg-OsZgeesd5kezp6qgTrwp2wjnDa/exec";

let DATA_STORE = { folders: [], profiles: [], periods: {}, types: {}, orgs: {}, rawPeriods: [], rawTypes: [], rawOrgs: [] };
let filteredData = [];
let expandedF = null, expandedP = null;
let currentUser = null;
let openDropdown = null;

const el = (id) => document.getElementById(id);

// Chuẩn hóa chuỗi siêu mạnh chống lệch từ khóa
const norm = (s) => (s || "").toString().toLowerCase().trim().replace(/[\s_]+/g, '');
const findKey = (obj, t) => {
    const nt = norm(t); 
    return Object.keys(obj).find(k => norm(k) === nt) || Object.keys(obj).find(k => norm(k).includes(nt)) || nt;
};
const id = (obj, type) => obj[findKey(obj, type + 'id')] || "";

async function bootstrap() {
    try {
        checkSession();
        if (el('bodyL1')) {
            // Đang ở index.html
             await loadAllData(true, false); 
        }
        else if (el('profileForm')) {
            // Đang ở entry.html
            await loadAllData(false, true); 
            setupUploadModal();
            if (!currentUser) {
                showToast("Vui lòng đăng nhập!", "error");
                setTimeout(() => window.location.href = 'login.html', 1000);
            } else {
                 const mh = el('modalUserHeader'); 
                 if(mh) {
                    mh.style.display = 'flex';
                    mh.querySelector('img').src = currentUser.avatar || "https://cdn-icons-png.flaticon.com/512/149/149071.png";
                    mh.querySelector('span').innerText = currentUser.name;
                 }
            }
        }
    } catch (err) {
        console.error(err);
        alert("Lỗi tải dữ liệu: " + err.message);
    } finally {
        const loader = el('loadingScreen');
        if (loader) loader.style.display = 'none'; // Ẩn màn hình loading mượt mà
    }
}

// ✨ NÂNG CẤP: Tải dữ liệu từ Firebase và theo dõi tiến độ %
async function loadAllData(renderTable, skipProfiles) {
    try {
        const queries = [
            db.collection(UI_CONFIG.SHEETS.period).get(),
            db.collection(UI_CONFIG.SHEETS.doctype).get(),
            db.collection(UI_CONFIG.SHEETS.org).get(),
            db.collection(UI_CONFIG.SHEETS.folder).get()
        ];

        if (!skipProfiles) {
            queries.push(db.collection(UI_CONFIG.SHEETS.profile).get());
        }

        const totalTasks = queries.length;
        let completedTasks = 0;
        const percentText = document.getElementById('loadPercent');

        const trackedQueries = queries.map(query => {
            return query.then(result => {
                completedTasks++;
                if (percentText) {
                    let percent = Math.round((completedTasks / totalTasks) * 100);
                    percentText.innerText = `${percent}%`;
                }
                return result; 
            });
        });

        const snapshots = await Promise.all(trackedQueries);

        const perData = snapshots[0].docs.map(doc => doc.data());
        const typeData = snapshots[1].docs.map(doc => doc.data());
        const orgData = snapshots[2].docs.map(doc => doc.data());
        const fData = snapshots[3].docs.map(doc => doc.data());
        
        DATA_STORE.rawPeriods = perData;
        DATA_STORE.rawTypes = typeData;
        DATA_STORE.rawOrgs = orgData;
        
        perData.forEach(r => { if(id(r, 'period')) DATA_STORE.periods[id(r, 'period')] = r[findKey(r, 'periodname')]; });
        typeData.forEach(r => { if(id(r, 'doctype')) DATA_STORE.types[id(r, 'doctype')] = r[findKey(r, 'doctypename')]; });
        orgData.forEach(r => { if(id(r, 'organization')) DATA_STORE.orgs[id(r, 'organization')] = r[findKey(r, 'organizationname')]; });

        DATA_STORE.folders = fData;
        filteredData = [...DATA_STORE.folders];

        if (!skipProfiles) {
            DATA_STORE.profiles = snapshots[4].docs.map(doc => doc.data()); 
        }

        if (renderTable) {
            renderHeaderL1();
            renderFolders();
        }
    } catch (e) {
        console.error("Lỗi Firebase:", e);
        throw new Error("Không thể tải dữ liệu từ kho lưu trữ mới.");
    }
}

/* --- TABLE FUNCTIONS (INDEX) --- */
function renderHeaderL1() {
    const head = el('headerL1');
    if(!head) return;
    let html = `<tr>`;
    UI_CONFIG.L1_COLUMNS.forEach(c => {
        let content = c.label;
        if(c.key === 'foldername') {
            content = `<div class="header-flex"><span>${c.label}</span><div class="nav-group">
                <i class="fa-solid fa-cloud-arrow-up icon-btn upload-btn" title="Upload hồ sơ" onclick="handleUploadClick()"></i>
                <div class="search-inline"><input type="text" id="searchInput" placeholder="Tìm kiếm nhanh...">
                <i class="fa-solid fa-magnifying-glass" style="color:#999; font-size:12px;"></i></div></div></div>`;
        }
        if(c.key === 'note') {
            content = `<div class="header-flex"><span>${c.label}</span><div class="nav-group safe-right">
                <i class="fa-solid fa-circle-user icon-btn" id="loginBtn" onclick="openLogin()" title="Đăng nhập"></i>
                <i class="fa-solid fa-right-from-bracket icon-btn logout-btn" id="logoutBtn" style="display:none" onclick="processLogout()" title="Đăng xuất"></i>
                <div id="userBadge" class="user-control"><div class="user-badge"><img id="uAvatar" class="user-avatar-mini" src=""><span id="uName"></span></div></div></div></div>`;
        }
        html += `<th style="width:${c.width}">${content}<div class="resizer"></div></th>`;
    });
    head.innerHTML = html + `</tr>`;
    attachResizers();
    const searchInp = el('searchInput');
    if(searchInp) {
        searchInp.oninput = (e) => {
            const q = norm(e.target.value);
            filteredData = DATA_STORE.folders.filter(f => norm(f[findKey(f, 'foldername')]).includes(q));
            renderFolders();
        };
    }
}

function renderFolders() {
    const body = el('bodyL1'); if(!body) return;
    body.innerHTML = '';
    
    const displayList = filteredData.length > 200 && !expandedF ? filteredData.slice(0, 100) : filteredData;
    const fragment = document.createDocumentFragment();

    displayList.forEach(f => {
        const fid = id(f, 'folder'); 
        const tr = document.createElement('tr');
        tr.className = `row-folder ${expandedF === fid ? 'active-f' : ''}`;
        
        tr.innerHTML = UI_CONFIG.L1_COLUMNS.map(c => `<td>${f[findKey(f, c.key)] || ""}</td>`).join('');
        
        tr.onclick = () => { 
            expandedF = (expandedF === fid) ? null : fid; 
            expandedP = null; 
            renderFolders(); 
        };
        
        fragment.appendChild(tr);

        if (expandedF === fid) {
            const cTr = document.createElement('tr'); 
            const td = document.createElement('td');
            td.colSpan = UI_CONFIG.L1_COLUMNS.length; 
            td.className = 'l2-box';
            
            const fProfiles = DATA_STORE.profiles ? DATA_STORE.profiles.filter(p => {
                const pFolderID = id(p, 'folder'); 
                if (!pFolderID) return false;
                return pFolderID.toString().split(',').map(s => s.trim().toLowerCase())
                                 .includes(fid.toString().toLowerCase());
            }) : [];

            const periods = [...new Set(fProfiles.map(p => id(p, 'period')))]
                            .filter(p => p !== "")
                            .sort(); 

            if(periods.length === 0) {
                 td.innerHTML = `<div style="padding:20px; color:#94a3b8; font-style:italic; text-align:center;">
                                    <i class="fa-solid fa-folder-open" style="margin-right:8px;"></i>Trống (Chưa có hồ sơ trong giai đoạn nào)
                                 </div>`;
            } else {
                periods.forEach(pid => {
                    const pName = DATA_STORE.periods[pid] || `Giai đoạn: ${pid}`;
                    const pDiv = document.createElement('div'); 
                    pDiv.className = `period-item ${expandedP === pid ? 'active-p' : ''}`;
                    
                    const icon = expandedP === pid ? 'fa-chevron-down' : 'fa-chevron-right';
                    pDiv.innerHTML = `<span class="p-title"><i class="fa-solid fa-calendar-days" style="margin-right:10px; opacity:0.7"></i>${pName}</span> 
                                      <i class="fa-solid ${icon}" style="font-size:10px; opacity:0.5"></i>`;
                    
                    pDiv.onclick = (e) => { 
                        e.stopPropagation(); 
                        expandedP = (expandedP === pid) ? null : pid; 
                        renderFolders(); 
                    };
                    td.appendChild(pDiv);

                    if (expandedP === pid) {
                        const l3c = document.createElement('div'); 
                        l3c.className = 'l3-container';
                        
                        let h = `<table class="table-l3">
                                    <thead><tr>`;
                        
                        UI_CONFIG.L3_COLUMNS.forEach(c => {
                            const isHidden = ['fileid', 'accountupdate', 'timeupdate'].includes(c.key);
                            h += `<th style="width:${c.width}${isHidden ? ';display:none' : ''}">${c.label}</th>`;
                        });
                        h += `</tr></thead><tbody>`;

                        const filteredProfiles = fProfiles.filter(p => id(p, 'period') === pid);
                        
                        filteredProfiles.forEach(prof => {
                            h += `<tr>`;
                            UI_CONFIG.L3_COLUMNS.forEach(c => {
                                if(c.key === 'download') {
                                    let fileId = prof[findKey(prof, 'fileid')];
                                    if(fileId) {
                                        let action = `window.open('https://drive.google.com/file/d/${fileId}/view', '_blank')`;
                                        h += `<td style="text-align:center;"><i class="fa-solid fa-file-arrow-down icon-btn" onclick="${action}" title="Tải file"></i></td>`;
                                    } else {
                                        h += `<td style="text-align:center; color:#ddd;"><i class="fa-solid fa-file-circle-xmark" title="Không có file"></i></td>`;
                                    }
                                } else {
                                    let v = prof[findKey(prof, c.key)] || "";
                                    if (c.key === 'periodid') v = DATA_STORE.periods[v] || v;
                                    if (c.key === 'doctypeid') v = DATA_STORE.types[v] || v;
                                    if (c.key === 'organizationid') v = DATA_STORE.orgs[v] || v;
                                    
                                    const isHidden = ['fileid', 'accountupdate', 'timeupdate'].includes(c.key);
                                    h += `<td title="${v}" style="${isHidden ? 'display:none;' : ''}">${v}</td>`;
                                }
                            });
                            h += `</tr>`;
                        });
                        
                        l3c.innerHTML = h + `</tbody></table>`; 
                        td.appendChild(l3c);
                    }
                });
            }
            cTr.appendChild(td); fragment.appendChild(cTr);
        }
    });
    
    body.appendChild(fragment);
    if(currentUser) updateUI(currentUser);
}

/* --- NAVIGATION & LOGIN --- */
function openLogin() { window.location.href = 'login.html'; }
function closeLogin() { window.location.href = 'index.html'; }
function togglePass() {
    const p = el('modalPass'); const i = el('eyeIcon');
    p.type = p.type === 'password' ? 'text' : 'password';
    i.classList.toggle('fa-eye'); i.classList.toggle('fa-eye-slash');
}
async function processLogin() {
    const u = el('modalUser'); const p = el('modalPass');
    const btn = el('btnLoginAction'); const st = el('loginStatus');
    if(!u.value || !p.value) { st.innerText = "Vui lòng nhập đủ thông tin"; st.style.display = 'block'; return; }
    btn.disabled = true; btn.innerHTML = `<div class="spinner-mini"></div> ĐANG KIỂM TRA...`;
    try {
        const res = await fetch(WEB_APP_URL, { method: "POST", body: JSON.stringify({ action: "login", username: u.value, password: p.value }) });
        const r = await res.json();
        if(r.success) {
            localStorage.setItem("userSession", JSON.stringify(r.data));
            showToast("Đăng nhập thành công!", "success");
            setTimeout(() => window.location.href = 'index.html', 500);
        } else { st.innerText = r.message; st.style.display = "block"; }
    } catch(e) { st.innerText = "Lỗi kết nối máy chủ!"; st.style.display = "block"; }
    finally { btn.disabled = false; btn.innerHTML = "XÁC NHẬN"; }
}
function processLogout() {
    localStorage.removeItem("userSession"); currentUser = null;
    el('loginBtn').style.display = 'block';
    el('logoutBtn').style.display = 'none';
    el('userBadge').style.display = 'none';
    showToast("Đã đăng xuất", "info");
}
function checkSession() {
    const s = localStorage.getItem("userSession"); if(s) updateUI(JSON.parse(s));
}
function updateUI(data) {
    currentUser = data;
    const loginBtn = el('loginBtn');
    const logoutBtn = el('logoutBtn');
    const userBadge = el('userBadge');
    if(loginBtn) loginBtn.style.display = 'none';
    if(logoutBtn) logoutBtn.style.display = 'block';
    if(userBadge) {
        userBadge.style.display = 'flex';
        el('uName').innerText = data.name;
        el('uAvatar').src = data.avatar || "https://cdn-icons-png.flaticon.com/512/149/149071.png";
    }
}

/* --- UPLOAD / ENTRY --- */
function handleUploadClick() {
    if(!currentUser) { showToast("Vui lòng đăng nhập!", "error"); openLogin(); }
    else window.location.href = 'entry.html';
}
function closeUploadModal() { window.location.href = 'index.html'; }

function setupUploadModal() {
    if(!el('profileForm')) return;
    
    console.log("📥 Đang đổ dữ liệu Danh mục vào Form Upload...", DATA_STORE);

    const fillSelect = (id, list, lblKey, valKey) => {
        const d_el = el(id); 
        if(!d_el) return;
        d_el.innerHTML = `<option value="">-- Chọn --</option>`;
        list.forEach(i => {
            const txt = i[findKey(i, lblKey)]; const val = i[findKey(i, valKey)];
            if(txt) d_el.add(new Option(txt, val));
        });
    };
    
    // Nếu các mảng rawPeriods trống, list sẽ trống trơn (Do Firebase chưa có dữ liệu)
    fillSelect('periodSelect', DATA_STORE.rawPeriods, 'periodname', 'periodid');
    fillSelect('typeSelect', DATA_STORE.rawTypes, 'doctypename', 'doctypeid');
    fillSelect('orgSelect', DATA_STORE.rawOrgs, 'organizationname', 'organizationid');

    const checkboxGroup = el('folderOptions');
    checkboxGroup.innerHTML = '';
    DATA_STORE.folders.forEach(folder => {
        const folderName = folder[findKey(folder, 'foldername')];
        const folderId = folder[findKey(folder, 'folderid')];
        if (folderName && folderId) {
            const div = document.createElement('div');
            div.className = 'checkbox-item';
            div.innerHTML = `<input type="checkbox" name="folderCheckbox" value="${folderId}"> <label>${folderName}</label>`;
            checkboxGroup.appendChild(div);
        }
    });
    
    const selectedText = document.querySelector('.selected-text');
    function updateSelectedText() {
        const checked = Array.from(checkboxGroup.querySelectorAll('input:checked'));
        selectedText.innerText = checked.length > 0 ? checked.map(cb => cb.nextElementSibling.innerText).join(', ') : 'Chọn hồ sơ...';
    }
    checkboxGroup.addEventListener('change', () => {
        updateSelectedText();
        validateUploadForm();
    });
    
    const dropzone = el('dropzone');
    const fileInput = el('fileInput');
    const fileStatus = el('file-status');
    
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault(); dropzone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) { fileInput.files = e.dataTransfer.files; updateFileStatus(e.dataTransfer.files[0].name); }
    });
    fileInput.addEventListener('change', (e) => { if (e.target.files.length > 0) updateFileStatus(e.target.files[0].name); });
    function updateFileStatus(name) {
        fileStatus.innerText = "📁 File: " + name; fileStatus.style.color = "#0061d5"; fileStatus.style.fontWeight = "bold";
        dropzone.classList.add('has-file'); validateUploadForm();
    }
    const reqInputs = document.querySelectorAll('.req-input');
    reqInputs.forEach(input_el => {
        input_el.addEventListener('input', validateUploadForm);
        input_el.addEventListener('change', validateUploadForm);
    });

    el('profileForm').onsubmit = async (e) => {
        e.preventDefault();
        const btn = el('btnSubmit');
        btn.disabled = true; btn.innerText = "ĐANG LƯU...";
        
        const checkedFolders = document.querySelectorAll('#folderOptions input[type="checkbox"]:checked');
        const selectedFolderIds = Array.from(checkedFolders).map(cb => cb.value).join(',');
        const orgId = el('orgSelect').value || "";
        const nnnnn = (orgId.slice(-5) || "00000").padStart(5, '0');
        const now = new Date();
        
        const pad = (num) => String(num).padStart(2, '0');
        const dd = pad(now.getDate()), mm = pad(now.getMonth() + 1), yy = String(now.getFullYear()).slice(-2);
        const hh = pad(now.getHours()), mi = pad(now.getMinutes()), ss = pad(now.getSeconds());
        const xx = pad(Math.floor(Math.random() * 100));
        
        const profileId = `POR_${nnnnn}_${dd}${mm}${yy}_${hh}${mi}${ss}_${xx}`;
        el('u_profileId').value = profileId;
        el('u_updateTime').value = `${dd}/${mm}/${now.getFullYear()} ${hh}:${mi}:${ss}`;
        
        if (currentUser && currentUser.userId) el('u_account').value = currentUser.userId;
        
        const payload = {};
        document.querySelectorAll('#profileForm [data-col]').forEach(dom_el => {
            payload[dom_el.getAttribute('data-col')] = dom_el.value;
        });
        payload.FolderID = selectedFolderIds;
        
        try {
            let finalFileId = "";
            const fi = el('fileInput');
            if (fi.files.length > 0) {
                const file = fi.files[0];
                const extension = file.name.includes('.') ? "." + file.name.split('.').pop() : "";
                const newFileName = profileId + extension;
                const base64 = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result.split(',')[1]);
                    reader.readAsDataURL(file);
                });
                
                const response = await fetch(WEB_APP_URL, { 
                    method: 'POST', 
                    body: JSON.stringify({
                        action: "upload_file",
                        fileBase64: base64,
                        mimeType: file.type || "application/octet-stream",
                        fileName: newFileName
                    }) 
                });
                const result = await response.json();
                if(result.success) {
                    finalFileId = result.fileId; 
                } else throw new Error(result.message || "Lỗi lưu file lên Drive.");
            }
            
            payload.fileid = finalFileId; 
            await db.collection(UI_CONFIG.SHEETS.profile).add(payload);
            
            showToast("Lưu thành công vào Firebase!", "success");
            e.target.reset();
            document.querySelectorAll('#folderOptions input[type="checkbox"]').forEach(cb => cb.checked = false);
            document.querySelector('.selected-text').innerText = 'Chọn hồ sơ...';
            el('dropzone').classList.remove('has-file');
            el('file-status').innerText = "Chưa có file nào";
            setTimeout(() => window.location.href = 'index.html', 1500);

        } catch (err) { 
            showToast("Lỗi: " + err.message, "error"); 
        } finally { 
            btn.disabled = false; btn.innerText = "LƯU HỒ SƠ"; 
        }
    };
}

function validateUploadForm() {
    const checkedFolders = document.querySelectorAll('#folderOptions input[type="checkbox"]:checked');
    const period = el('periodSelect').value;
    const type = el('typeSelect').value;
    const abstract = el('abstractInput').value;
    const hasFile = el('fileInput').files.length > 0;
    const hasFolder = checkedFolders.length > 0;
    const btn = el('btnSubmit');
    if(btn) btn.disabled = !(hasFolder && period && type && abstract && hasFile);
}

function showToast(txt, type) {
    let color = type === "error" ? "#d93025" : (type === "info" ? "#333" : "#0061d5");
    Toastify({ text: txt, duration: 6000, gravity: "bottom", position: "right", className: "toast-custom", style: { background: color } }).showToast();
}
function attachResizers() {
    document.querySelectorAll('.resizer').forEach(r => {
        r.onmousedown = (e) => {
            const th = r.parentElement; const startX = e.pageX; const startW = th.offsetWidth;
            const move = (ev) => { th.style.width = (startW + (ev.pageX - startX)) + 'px'; };
            const stop = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', stop); };
            document.addEventListener('mousemove', move); document.addEventListener('mouseup', stop);
        };
    });
}
function toggleDropdown(dom_el) {
    const container = dom_el.nextElementSibling;
    if (openDropdown && openDropdown !== container) {
        openDropdown.style.display = 'none';
    }
    container.style.display = container.style.display === 'none' ? 'block' : 'none';
    openDropdown = container.style.display === 'block' ? container : null;
}
document.addEventListener('click', (e) => {
    if (openDropdown && !openDropdown.contains(e.target) && !e.target.closest('.select-box')) {
        openDropdown.style.display = 'none';
        openDropdown = null;
    }
});
bootstrap();



/* =========================================================================
   ✨ CÔNG CỤ QUẢN TRỊ: BƠM DỮ LIỆU TỪ SHEET SANG FIREBASE (CHẠY TỪ CONSOLE)
   ========================================================================= */
window.adminMigrateData = async function() {
    // Thêm cảnh báo Quota để ní ko lỡ tay ấn nhầm
    if(!confirm("CẢNH BÁO QUOTA: Quá trình này sẽ ghi dữ liệu lên Firebase.\nChỉ chạy 1 lần duy nhất khi Firebase đang trống. Bạn chắc chắn chứ?")) return;
    
    console.log("🌊 Đang kết nối Apps Script để lấy dữ liệu...");
    const collections = [UI_CONFIG.SHEETS.period, UI_CONFIG.SHEETS.doctype, UI_CONFIG.SHEETS.org, UI_CONFIG.SHEETS.folder, UI_CONFIG.SHEETS.profile];
    
    // Bộ lọc chống lỗi dấu phẩy cực mạnh
    function parseCSVFasLight(text) {
        const rows = []; let row = []; let curVal = ''; let inQuote = false;
        for (let i = 0; i < text.length; i++) {
            const c = text[i]; const next = text[i+1];
            if (inQuote) {
                if (c === '"' && next === '"') { curVal += '"'; i++; } else if (c === '"') { inQuote = false; } else { curVal += c; }
            } else {
                if (c === '"') { inQuote = true; } else if (c === ',') { row.push(curVal); curVal = ''; } else if (c === '\n' || c === '\r') {
                    if (curVal || row.length > 0) row.push(curVal); if (row.length > 0) rows.push(row); row = []; curVal = '';
                    if (c === '\r' && next === '\n') i++;
                } else { curVal += c; }
            }
        }
        if (curVal || row.length > 0) { row.push(curVal); rows.push(row); }
        if (rows.length === 0) return [];
        const headers = rows[0].map(h => h.replace(/^\uFEFF/, '').toLowerCase().trim().replace(/\s+/g, ''));
        const result = [];
        for(let i = 1; i < rows.length; i++) {
            const r = rows[i];
            if (r.length > 0 && (r.length > 1 || r[0] !== '')) {
                let o = {};
                for(let j = 0; j < headers.length; j++) { o[headers[j]] = r[j] || ""; }
                result.push(o);
            }
        }
        return result;
    }

    try {
        for (let col of collections) {
            console.log(`Đang tải dữ liệu từ Sheet: [${col}]...`);
            const url = `${WEB_APP_URL}?sheet=${encodeURIComponent(col)}`;
            const res = await fetch(url);
            const text = await res.text();
            
            const data = parseCSVFasLight(text);
            console.log(`🚀 Bắt đầu đẩy ${data.length} dòng lên bảng [${col}]...`);
            
            let batches = []; let currentBatch = db.batch(); let count = 0;
            
            for (let i = 0; i < data.length; i++) {
                // 🛡️ CHỐNG TRÙNG LẶP: Tìm ID cụ thể của dòng (VD: FolderID, ProfileID)
                let idColName = col + 'id'; 
                let exactId = data[i][findKey(data[i], idColName)];
                
                let docRef;
                if (exactId && exactId.trim() !== "") {
                    // Firebase không cho phép ID có chứa dấu "/", nên ta đổi thành "_" cho an toàn tuyệt đối
                    let safeId = exactId.toString().replace(/\//g, '_');
                    docRef = db.collection(col).doc(safeId);
                } else {
                    // Dòng nào trống trơn ID (dữ liệu lỗi bên Sheet) thì mới phải dùng ngẫu nhiên
                    docRef = db.collection(col).doc(); 
                }

                currentBatch.set(docRef, data[i]);
                count++;
                
                if (count === 490) { 
                    batches.push(currentBatch.commit());
                    currentBatch = db.batch(); count = 0;
                }
            }
            if (count > 0) batches.push(currentBatch.commit());
            await Promise.all(batches);
            console.log(`✅ Chuyển thành công bảng chuẩn: ${col}`);
        }
        alert("🎉 CHUYỂN NHÀ THÀNH CÔNG 100%! Bấm OK, trình duyệt sẽ tự tải lại trang.");
        window.location.reload();
    } catch(e) { 
        console.error(e); 
        alert("❌ Lỗi chuyển nhà: " + e.message); 
    }
}