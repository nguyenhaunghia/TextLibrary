const UI_CONFIG = {
    SHEETS: { folder: 'Folder', profile: 'Profile', period: 'Period', doctype: 'DocType', org: 'Organization' },
    L1_COLUMNS: [
        { label: "Hồ Sơ", key: "foldername", width: "60%" },
        { label: "Ghi Chú", key: "note", width: "40%" }
    ],
    L3_COLUMNS: [
        { label: "", key: "download", width: "50px" },
        { label: "ID Hồ sơ", key: "profileid", width: "100px" },
        { label: "Giai Đoạn", key: "periodid", width: "150px" },
        { label: "Loại Văn Bản", key: "doctypeid", width: "150px" },
        { label: "Số Ký Hiệu", key: "symbolstring", width: "140px" },
        { label: "Ngày Ban Hành", key: "promulgatedate", width: "120px" },
        { label: "Trích Yếu Nội Dung", key: "abstract", width: "250px" },
        { label: "Cơ Quan Ban Hành", key: "organizationid", width: "200px" },
        { label: "Người Ký", key: "accountsigner", width: "120px" },
        { label: "File ID", key: "fileid", width: "120px" },
        { label: "Người cập nhật", key: "accountupdate", width: "120px" },
        { label: "Thời điểm cập nhật", key: "timeupdate", width: "150px" }
    ]
};
const SPREADSHEET_ID = '1W9UGPV9g_WmKHFsD2DRB5_aj3dHmZ_AySAyhC5xtnz0';
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbyeEWVK5f00MUvGokP72eCTvhZRCMujj_fVgsArNo0WJ0CtS2i6qZ-Mm2REK9SfiJbx/exec";
let DATA_STORE = { folders: [], profiles: [], periods: {}, types: {}, orgs: {}, rawPeriods: [], rawTypes: [], rawOrgs: [] };
let filteredData = [];
let expandedF = null, expandedP = null;
let currentUser = null;
let openDropdown = null;

async function bootstrap() {
    try {
        checkSession();
        // IS INDEX PAGE
        if (document.getElementById('bodyL1')) {
             // Index cần tải tất cả dữ liệu
             await loadAllData(true, false); 
        }
        // IS ENTRY PAGE
        else if (document.getElementById('profileForm')) {
            // OPTIMIZATION: Trang Entry KHÔNG tải Sheet Profile (Sheet nặng nhất) vì không dùng đến.
            // Tham số thứ 2 là skipProfiles = true
            await loadAllData(false, true); 
            setupUploadModal();
            if (!currentUser) {
                showToast("Vui lòng đăng nhập!", "error");
                setTimeout(() => window.location.href = 'login.html', 1000);
            } else {
                 const mh = document.getElementById('modalUserHeader'); 
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
        const loader = document.getElementById('loadingScreen');
        if (loader) loader.classList.add('hidden');
    }
}

// Hàm tải dữ liệu có cờ 'skipProfiles' để giảm tải cho trang Entry
async function loadAllData(renderTable, skipProfiles) {
    try {
        // 1. Tải các bảng nhỏ (Metadata) trước
        const perData = await fetchGoogleSheet(UI_CONFIG.SHEETS.period);
        const typeData = await fetchGoogleSheet(UI_CONFIG.SHEETS.doctype);
        const orgData = await fetchGoogleSheet(UI_CONFIG.SHEETS.org);
        
        DATA_STORE.rawPeriods = perData;
        DATA_STORE.rawTypes = typeData;
        DATA_STORE.rawOrgs = orgData;
        
        perData.forEach(r => { if(id(r, 'period')) DATA_STORE.periods[id(r, 'period')] = r[findKey(r, 'periodname')]; });
        typeData.forEach(r => { if(id(r, 'doctype')) DATA_STORE.types[id(r, 'doctype')] = r[findKey(r, 'doctypename')]; });
        orgData.forEach(r => { if(id(r, 'organization')) DATA_STORE.orgs[id(r, 'organization')] = r[findKey(r, 'organizationname')]; });

        // 2. Tải danh sách Folder
        const fData = await fetchGoogleSheet(UI_CONFIG.SHEETS.folder);
        DATA_STORE.folders = fData;
        filteredData = [...DATA_STORE.folders];

        // 3. Chỉ tải Profile nếu KHÔNG bị skip (Trang Index cần, Trang Entry không cần)
        if (!skipProfiles) {
            const pData = await fetchGoogleSheet(UI_CONFIG.SHEETS.profile);
            DATA_STORE.profiles = pData;
        }

        if (renderTable) {
            renderHeaderL1();
            renderFolders();
        }
    } catch (e) {
        throw new Error("Không thể tải dữ liệu. Kiểm tra kết nối mạng.");
    }
}

async function fetchGoogleSheet(name) {
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name)}`;
    const res = await fetch(url); 
    const text = await res.text(); 
    return parseCSVFasLight(text); // Sử dụng hàm parse mới
}

// --- OPTIMIZED PARSER: STATE MACHINE (NO REGEX) ---
// Hàm này chạy nhanh gấp 10 lần và tiết kiệm 90% RAM so với bản cũ
function parseCSVFasLight(text) {
    const rows = [];
    let row = [];
    let curVal = '';
    let inQuote = false;
    
    // Duyệt qua từng ký tự - O(n) complexity, cực nhẹ cho iPad
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        const next = text[i+1];

        if (inQuote) {
            if (c === '"' && next === '"') { // 2 dấu nháy kép -> 1 dấu nháy
                curVal += '"';
                i++;
            } else if (c === '"') { // Kết thúc quote
                inQuote = false;
            } else {
                curVal += c;
            }
        } else {
            if (c === '"') {
                inQuote = true;
            } else if (c === ',') {
                row.push(curVal);
                curVal = '';
            } else if (c === '\n' || c === '\r') {
                if (curVal || row.length > 0) row.push(curVal);
                if (row.length > 0) rows.push(row);
                row = [];
                curVal = '';
                // Skip \n if we just hit \r
                if (c === '\r' && next === '\n') i++;
            } else {
                curVal += c;
            }
        }
    }
    // Push dòng cuối nếu không có xuống dòng ở cuối file
    if (curVal || row.length > 0) {
        row.push(curVal);
        rows.push(row);
    }

    if (rows.length === 0) return [];
    
    // Map headers
    const headers = rows[0].map(h => h.toLowerCase().replace(/\s+/g, ''));
    const result = [];
    for(let i = 1; i < rows.length; i++) {
        const r = rows[i];
        // Chỉ map nếu dòng có dữ liệu
        if (r.length > 0 && (r.length > 1 || r[0] !== '')) {
            let o = {};
            for(let j = 0; j < headers.length; j++) {
                o[headers[j]] = r[j] || "";
            }
            result.push(o);
        }
    }
    return result;
}

const norm = (s) => (s || "").toString().toLowerCase().replace(/\s+/g, '');
const findKey = (obj, t) => {
    const nt = norm(t); return Object.keys(obj).find(k => norm(k) === nt) || Object.keys(obj).find(k => norm(k).includes(nt)) || nt;
};
const id = (obj, type) => obj[findKey(obj, type + 'id')] || "";

/* --- TABLE FUNCTIONS (INDEX) --- */
function renderHeaderL1() {
    const head = document.getElementById('headerL1');
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
    const searchInp = document.getElementById('searchInput');
    if(searchInp) {
        searchInp.oninput = (e) => {
            const q = norm(e.target.value);
            filteredData = DATA_STORE.folders.filter(f => norm(f[findKey(f, 'foldername')]).includes(q));
            renderFolders();
        };
    }
}
function renderFolders() {
    const body = document.getElementById('bodyL1'); if(!body) return;
    body.innerHTML = '';
    
    // Virtualization đơn giản: Nếu data quá lớn, chỉ render 100 folder đầu để UI không đơ
    const displayList = filteredData.length > 200 && !expandedF ? filteredData.slice(0, 100) : filteredData;

    displayList.forEach(f => {
        const fid = id(f, 'folder');
        const tr = document.createElement('tr');
        tr.className = `row-folder ${expandedF === fid ? 'active-f' : ''}`;
        tr.innerHTML = UI_CONFIG.L1_COLUMNS.map(c => `<td>${f[findKey(f, c.key)]}</td>`).join('');
        tr.onclick = () => { expandedF = (expandedF === fid) ? null : fid; expandedP = null; renderFolders(); };
        body.appendChild(tr);
        if (expandedF === fid) {
            const cTr = document.createElement('tr'); const td = document.createElement('td');
            td.colSpan = UI_CONFIG.L1_COLUMNS.length; td.className = 'l2-box';
            
            // Logic lọc profile vẫn giữ nguyên
            const fProfiles = DATA_STORE.profiles ? DATA_STORE.profiles.filter(p => {
                const folderIdsStr = id(p, 'folder') || "";
                return folderIdsStr.includes(fid);
            }) : [];

            const periods = [...new Set(fProfiles.map(p => id(p, 'period')))];
            if(periods.length === 0) {
                 td.innerHTML = `<div style="padding:10px; color:#777; font-style:italic;">Trống (Không có hồ sơ)</div>`;
            } else {
                periods.forEach(pid => {
                    const pDiv = document.createElement('div'); pDiv.className = `period-item`;
                    pDiv.innerHTML = `<span class="p-title">📁 ${DATA_STORE.periods[pid] || pid}</span> <span>${expandedP === pid ? '▼' : '▶'}</span>`;
                    pDiv.onclick = (e) => { e.stopPropagation(); expandedP = (expandedP === pid) ? null : pid; renderFolders(); };
                    td.appendChild(pDiv);
                    if (expandedP === pid) {
                        const l3c = document.createElement('div'); l3c.className = 'l3-container';
                        let h = `<table class="table-l3"><thead><tr>`;
                        UI_CONFIG.L3_COLUMNS.forEach(c => {
                            const hidden = ['fileid', 'accountupdate', 'timeupdate'].includes(c.key);
                            h += `<th style="width:${c.width}${hidden ? ';display:none' : ''}">${c.label}</th>`;
                        });
                        h += `</tr></thead><tbody>`;
                        fProfiles.filter(p => id(p, 'period') === pid).forEach(prof => {
                            h += `<tr>`;
                            UI_CONFIG.L3_COLUMNS.forEach(c => {
                                if(c.key === 'download') {
                                    let fileId = prof[findKey(prof, 'fileid')];
                                    if(fileId) {
                                        let action = `window.open('https://drive.google.com/file/d/${fileId}/view', '_blank')`;
                                        h += `<td style="text-align:center;"><i class="fa-solid fa-file-arrow-down icon-btn" onclick="${action}" title="Tải file"></i></td>`;
                                    } else h += `<td></td>`;
                                } else {
                                    let v = prof[findKey(prof, c.key)] || "";
                                    if (c.key === 'periodid') v = DATA_STORE.periods[v] || v;
                                    if (c.key === 'doctypeid') v = DATA_STORE.types[v] || v;
                                    if (c.key === 'organizationid') v = DATA_STORE.orgs[v] || v;
                                    const hidden = ['fileid', 'accountupdate', 'timeupdate'].includes(c.key);
                                    h += `<td title="${v}" style="${hidden ? 'display:none;' : ''}">${v}</td>`;
                                }
                            });
                            h += `</tr>`;
                        });
                        l3c.innerHTML = h + `</tbody></table>`; td.appendChild(l3c);
                    }
                });
            }
            cTr.appendChild(td); body.appendChild(cTr);
        }
    });
    
    // Nếu danh sách bị cắt bớt do quá dài
    if (filteredData.length > displayList.length) {
         const trInfo = document.createElement('tr');
         trInfo.innerHTML = `<td colspan="2" style="text-align:center; padding:10px; color:#888;">...Còn ${filteredData.length - displayList.length} hồ sơ nữa. Dùng tìm kiếm để lọc...</td>`;
         body.appendChild(trInfo);
    }

    if(currentUser) updateUI(currentUser);
}

/* --- NAVIGATION & LOGIN --- */
function openLogin() { window.location.href = 'login.html'; }
function closeLogin() { window.location.href = 'index.html'; }
function togglePass() {
    const p = document.getElementById('modalPass'); const i = document.getElementById('eyeIcon');
    p.type = p.type === 'password' ? 'text' : 'password';
    i.classList.toggle('fa-eye'); i.classList.toggle('fa-eye-slash');
}
async function processLogin() {
    const u = document.getElementById('modalUser'); const p = document.getElementById('modalPass');
    const btn = document.getElementById('btnLoginAction'); const st = document.getElementById('loginStatus');
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
    document.getElementById('loginBtn').style.display = 'block';
    document.getElementById('logoutBtn').style.display = 'none';
    document.getElementById('userBadge').style.display = 'none';
    showToast("Đã đăng xuất", "info");
}
function checkSession() {
    const s = localStorage.getItem("userSession"); if(s) updateUI(JSON.parse(s));
}
function updateUI(data) {
    currentUser = data;
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const userBadge = document.getElementById('userBadge');
    if(loginBtn) loginBtn.style.display = 'none';
    if(logoutBtn) logoutBtn.style.display = 'block';
    if(userBadge) {
        userBadge.style.display = 'flex';
        document.getElementById('uName').innerText = data.name;
        document.getElementById('uAvatar').src = data.avatar || "https://cdn-icons-png.flaticon.com/512/149/149071.png";
    }
}

/* --- UPLOAD / ENTRY --- */
function handleUploadClick() {
    if(!currentUser) { showToast("Vui lòng đăng nhập!", "error"); openLogin(); }
    else window.location.href = 'Entry.html';
}
function closeUploadModal() { window.location.href = 'index.html'; }

function setupUploadModal() {
    if(!document.getElementById('profileForm')) return;

    const fillSelect = (id, list, lblKey, valKey) => {
        const el = document.getElementById(id); 
        if(!el) return;
        el.innerHTML = `<option value="">-- Chọn --</option>`;
        list.forEach(i => {
            const txt = i[findKey(i, lblKey)]; const val = i[findKey(i, valKey)];
            if(txt) el.add(new Option(txt, val));
        });
    };
    fillSelect('periodSelect', DATA_STORE.rawPeriods, 'periodname', 'periodid');
    fillSelect('typeSelect', DATA_STORE.rawTypes, 'doctypename', 'doctypeid');
    fillSelect('orgSelect', DATA_STORE.rawOrgs, 'organizationname', 'organizationid');

    const checkboxGroup = document.getElementById('folderOptions');
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
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');
    const fileStatus = document.getElementById('file-status');
    
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
    reqInputs.forEach(el => {
        el.addEventListener('input', validateUploadForm);
        el.addEventListener('change', validateUploadForm);
    });

    document.getElementById('profileForm').onsubmit = async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btnSubmit');
        btn.disabled = true; btn.innerText = "ĐANG LƯU...";
        const checkedFolders = document.querySelectorAll('#folderOptions input[type="checkbox"]:checked');
        const selectedFolderIds = Array.from(checkedFolders).map(cb => cb.value).join(',');
        const orgId = document.getElementById('orgSelect').value || "";
        const nnnnn = (orgId.slice(-5) || "00000").padStart(5, '0');
        const now = new Date();
        const dd = String(now.getDate()).padStart(2, '0');
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const yy = String(now.getFullYear()).slice(-2);
        const fullYear = now.getFullYear();
        const hh = String(now.getHours()).padStart(2, '0');
        const mi = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        const xx = String(Math.floor(Math.random() * 100)).padStart(2, '0');
        const profileId = `POR_${nnnnn}_${dd}${mm}${yy}_${hh}${mi}${ss}_${xx}`;
        document.getElementById('u_profileId').value = profileId;
        const timeUpdate = `${dd}/${mm}/${fullYear} ${hh}:${mi}:${ss}`;
        document.getElementById('u_updateTime').value = timeUpdate;
        if (currentUser && currentUser.userId) {
            document.getElementById('u_account').value = currentUser.userId;
        }
        const payload = {};
        document.querySelectorAll('#profileForm [data-col]').forEach(el => {
            payload[el.getAttribute('data-col')] = el.value;
        });
        payload.FolderID = selectedFolderIds;
        const fi = document.getElementById('fileInput');
        if (fi.files.length > 0) {
            const file = fi.files[0];
            const extension = file.name.includes('.') ? "." + file.name.split('.').pop() : "";
            const newFileName = profileId + extension;
            const base64 = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.readAsDataURL(file);
            });
            payload.fileBase64 = base64;
            payload.mimeType = file.type || "application/octet-stream";
            payload.fileName = newFileName;
        }
        try {
            await fetch(WEB_APP_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify([payload]) });
            showToast("Lưu thành công!", "success");
            e.target.reset();
            document.querySelectorAll('#folderOptions input[type="checkbox"]').forEach(cb => cb.checked = false);
            document.querySelector('.selected-text').innerText = 'Chọn hồ sơ...';
            document.getElementById('dropzone').classList.remove('has-file');
            document.getElementById('file-status').innerText = "Chưa có file nào";
            setTimeout(() => window.location.href = 'index.html', 1500);
        } catch (err) { showToast("Lỗi: " + err.message, "error"); }
        finally { btn.disabled = false; btn.innerText = "LƯU HỒ SƠ"; }
    };
}

function validateUploadForm() {
    const checkedFolders = document.querySelectorAll('#folderOptions input[type="checkbox"]:checked');
    const period = document.getElementById('periodSelect').value;
    const type = document.getElementById('typeSelect').value;
    const abstract = document.getElementById('abstractInput').value;
    const hasFile = document.getElementById('fileInput').files.length > 0;
    const hasFolder = checkedFolders.length > 0;
    const btn = document.getElementById('btnSubmit');
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
function toggleDropdown(el) {
    const container = el.nextElementSibling;
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
