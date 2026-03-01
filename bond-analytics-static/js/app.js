// Global Data Store
let globalData = [];

document.addEventListener('DOMContentLoaded', () => {
    initFileUpload();
    initSearch();
});

// 1. File Upload & Parsing
function initFileUpload() {
    const fileInput = document.getElementById('csvFileInput');
    
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Reset global data
        globalData = [];
        updateUIStatus("正在加载...");

        const fileName = file.name.toLowerCase();

        if (fileName.endsWith('.xlsx')) {
            // Handle Excel
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    
                    // Assume first sheet
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    
                    // Convert to JSON
                    // header: 1 produces array of arrays, but we want array of objects like CSV
                    // We need to handle headers manually if they are complex, but default works for simple tables
                    // 'defval' sets default value for empty cells
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
                    
                    processData(jsonData);
                } catch (err) {
                    console.error("Excel Parse Error:", err);
                    alert("解析 Excel 文件失败: " + err.message);
                }
            };
            reader.readAsArrayBuffer(file);
        } else {
            // Handle CSV (PapaParse)
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                encoding: "UTF-8", 
                complete: (results) => {
                    if (results.data) {
                        processData(results.data);
                    }
                },
                error: (err) => {
                    console.error("CSV Parse Error:", err);
                    alert("解析 CSV 文件失败: " + err.message);
                }
            });
        }
    });
}

function processData(data) {
    if (data && data.length > 0) {
        try {
            globalData = data;
            console.log(`Loaded ${globalData.length} records.`);
            
            updateUIStatus(data.length);
            renderPreview(data);
            
            // Enable tabs
            const chartsTab = document.getElementById('pills-charts-tab');
            const analysisTab = document.getElementById('pills-analysis-tab');
            
            chartsTab.classList.remove('disabled');
            chartsTab.removeAttribute('disabled');
            analysisTab.classList.remove('disabled');
            analysisTab.removeAttribute('disabled');
            
            // Populate filters immediately after load
            populateScatterFilters(globalData);
            
            // Trigger initial renders for Analysis Tab (even if hidden)
            renderTopLists(globalData);
            renderInstBehaviorTable(globalData);
            renderSpecificQuotesTable(globalData, 'rating_asc'); 
            initSpecificQuotesControl(); 
            
            // Handle Charts Tab
            const chartsTabBtn = document.getElementById('pills-charts-tab');
            if (chartsTabBtn.classList.contains('active')) {
                setTimeout(() => renderCharts(globalData), 100);
            }
            chartsTabBtn.addEventListener('shown.bs.tab', () => {
                renderCharts(globalData);
            });
            
        } catch (e) {
            console.error("Error processing data:", e);
            alert("数据处理发生错误: " + e.message);
        }
    }
}

function updateUIStatus(count) {
    document.getElementById('data-status').textContent = `已加载 ${count} 条记录`;
}

function renderPreview(data) {
    const tableBody = document.querySelector('#preview-table tbody');
    tableBody.innerHTML = '';
    document.getElementById('preview-section').classList.remove('d-none');

    // Show top 100
    const previewData = data.slice(0, 100);
    
    previewData.forEach(row => {
        const tr = document.createElement('tr');
        
        // Fields: timestamp, bond_code, Wind_Name_Final, direction, Val_Yield, Mod_Duration, Institution
        // Plus: Inst_Type, Issuer, Province, Is_Chengtou, Is_Perpetual, Is_SecondaryCapital
        const fields = [
            row['timestamp'] || '',
            row['Wind_Code_Final'] || row['bond_code'] || '',
            row['Wind_Name_Final'] || row['bond_name'] || '',
            row['direction'] || '',
            row['Val_Yield'] || '',
            row['Mod_Duration'] || '',
            row['Institution'] || '',
            row['Inst_Type'] || '',
            row['Issuer'] || '',
            row['Province'] || '',
            row['Is_Chengtou'] || '',
            row['Is_Perpetual'] || '',
            row['Is_SecondaryCapital'] || '',
            row['Implied_Rating'] || ''
        ];
        
        fields.forEach(val => {
            const td = document.createElement('td');
            td.textContent = val;
            tr.appendChild(td);
        });
        
        tableBody.appendChild(tr);
    });
}

// 2. Specific Analysis Logic
function initSearch() {
    document.getElementById('search-btn').addEventListener('click', performSearch);
    
    const searchInput = document.getElementById('search-input');
    
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });
    
    // Populate scatter filter options
    populateScatterFilters(globalData);
    
    // Autocomplete Logic
    searchInput.addEventListener('input', (e) => {
        const val = e.target.value.trim().toLowerCase();
        const type = document.getElementById('search-type').value;
        const datalist = document.getElementById('search-datalist');
        
        if (val.length < 1) {
            datalist.innerHTML = '';
            return;
        }
        
        // Get unique values based on type
        // Use a Set to store unique suggestions
        const suggestions = new Set();
        
        // Optimization: Don't iterate all data if it's too large on every keystroke.
        // Maybe limit iterations or just take top matches.
        // For simplicity, iterate until we have enough suggestions (e.g. 10).
        
        for (const row of globalData) {
            if (suggestions.size >= 10) break;
            
            let targetVal = '';
            if (type === 'Issuer') targetVal = row['Issuer'];
            else if (type === 'Bond') targetVal = row['Wind_Name_Final'] || row['bond_name'];
            else if (type === 'Region') targetVal = row['Province'];
            
            if (targetVal && targetVal.toString().toLowerCase().includes(val)) {
                suggestions.add(targetVal);
            }
        }
        
        // Render options
        datalist.innerHTML = '';
        suggestions.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item;
            datalist.appendChild(opt);
        });
    });
}

function populateScatterFilters(data) {
    const typeSelect = document.getElementById('scatter-filter-type');
    const instList = document.getElementById('scatter-inst-list');
    const applyBtn = document.getElementById('scatter-apply-btn');
    
    // 1. Populate Types
    const types = new Set();
    const institutions = new Set();
    
    data.forEach(row => {
        // Use 'Inst_Type' if available, otherwise check headers
        // CSV headers might be sensitive to case or spaces?
        // Let's trim and check.
        if (row['Inst_Type'] && row['Inst_Type'] !== 'Unknown' && row['Inst_Type'] !== 'Unclassified') {
             types.add(row['Inst_Type']);
        }
        if (row['Institution']) institutions.add(row['Institution']);
    });
    
    console.log("Populating filters with types:", Array.from(types)); // Debug log
    
    // Clear existing (except first)
    while (typeSelect.options.length > 1) {
        typeSelect.remove(1);
    }
    
    Array.from(types).sort().forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        typeSelect.appendChild(opt);
    });
    
    // 2. Populate Institution Datalist
    instList.innerHTML = '';
    Array.from(institutions).sort().forEach(inst => {
        const opt = document.createElement('option');
        opt.value = inst;
        instList.appendChild(opt);
    });
    
    // 3. Event Listener for Apply
    // Remove old listener if any (to avoid duplicates if called multiple times)
    const newBtn = applyBtn.cloneNode(true);
    applyBtn.parentNode.replaceChild(newBtn, applyBtn);
    
    newBtn.addEventListener('click', () => {
        renderScatterPlot(data);
    });
    
    // 4. Event Listener for Heatmap Metric
    const heatmapSelect = document.getElementById('heatmap-metric');
    // Remove old listener
    const newHeatmapSelect = heatmapSelect.cloneNode(true);
    heatmapSelect.parentNode.replaceChild(newHeatmapSelect, heatmapSelect);
    
    newHeatmapSelect.addEventListener('change', () => {
        renderHeatmap(data);
    });
}

function performSearch() {
    const type = document.getElementById('search-type').value;
    const term = document.getElementById('search-input').value.trim();
    
    if (!term) return;
    
    // Filter data
    const filtered = globalData.filter(row => {
        let val = '';
        if (type === 'Issuer') val = row['Issuer'];
        else if (type === 'Bond') val = row['Wind_Name_Final'] || row['bond_name'];
        else if (type === 'Region') val = row['Province'];
        
        return val && val.toString().includes(term);
    });
    
    // Group by Institution
    const instGroups = {};
    filtered.forEach(row => {
        const inst = row['Institution'];
        if (!inst) return;
        
        if (!instGroups[inst]) {
            instGroups[inst] = { name: inst, bid: 0, ofr: 0, total: 0, details: [] };
        }
        
        if (row['direction'] === 'bid') instGroups[inst].bid++;
        if (row['direction'] === 'ofr') instGroups[inst].ofr++;
        instGroups[inst].total++;
        
        // Collect details (up to 20 for performance)
        if (instGroups[inst].details.length < 20) {
             instGroups[inst].details.push({
                 time: row['timestamp'] ? row['timestamp'].substring(5, 16) : '-',
                 dir: row['direction'],
                 bond: row['Wind_Name_Final'] || row['bond_name'] || '-',
                 content: row['content'] || ''
             });
        }
    });
    
    // Convert to array and sort
    const results = Object.values(instGroups).sort((a, b) => b.total - a.total);
    
    renderSearchResults(results);
}

function renderSearchResults(results) {
    const container = document.getElementById('search-results-container');
    const tbody = document.querySelector('#search-results-table tbody');
    tbody.innerHTML = '';
    container.style.display = 'block';
    
    if (results.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">未找到相关记录</td></tr>';
        return;
    }
    
    // Use fragment for better performance
    const fragment = document.createDocumentFragment();

    results.forEach(res => {
        // Main Row
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.innerHTML = `
            <td>
                <i class="bi bi-chevron-right me-1 expand-icon"></i>
                <span class="fw-bold">${res.name}</span>
            </td>
            <td class="text-success">${res.bid}</td>
            <td class="text-danger">${res.ofr}</td>
            <td class="fw-bold">${res.total}</td>
        `;
        
        // Detail Row (Hidden by default)
        const trDetail = document.createElement('tr');
        trDetail.classList.add('d-none', 'bg-light');
        trDetail.innerHTML = `
            <td colspan="4" class="p-0">
                <div class="p-3">
                    <h6 class="small text-muted mb-2">最近报价记录 (最多20条):</h6>
                    <div class="table-responsive" style="max-height: 300px;">
                        <table class="table table-sm table-bordered mb-0 bg-white small">
                            <thead class="table-light">
                                <tr>
                                    <th>时间</th>
                                    <th>方向</th>
                                    <th>债券</th>
                                    <th>原文内容</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${res.details.map(d => `
                                    <tr>
                                        <td>${d.time}</td>
                                        <td class="${d.dir === 'bid' ? 'text-success' : (d.dir === 'ofr' ? 'text-danger' : '')}">${d.dir}</td>
                                        <td>${d.bond}</td>
                                        <td class="text-break" style="min-width: 200px;">${d.content}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </td>
        `;
        
        // Toggle Event
        tr.addEventListener('click', () => {
            trDetail.classList.toggle('d-none');
            const icon = tr.querySelector('.expand-icon');
            if (trDetail.classList.contains('d-none')) {
                icon.classList.remove('bi-chevron-down');
                icon.classList.add('bi-chevron-right');
            } else {
                icon.classList.remove('bi-chevron-right');
                icon.classList.add('bi-chevron-down');
            }
        });
        
        fragment.appendChild(tr);
        fragment.appendChild(trDetail);
    });
    
    tbody.appendChild(fragment);
}

function renderTopLists(data) {
    if (data.length === 0) return;
    
    // Helper to get date string YYYY-MM-DD
    const getDate = (row) => {
        return row['Quote_Date'] || (row['timestamp'] ? row['timestamp'].substring(0, 10) : '');
    };
    
    // Find latest date
    const dates = data.map(getDate).filter(d => d).sort();
    const latestDate = dates[dates.length - 1];
    
    if (!latestDate) return;
    
    const latestDateObj = new Date(latestDate);
    const weekAgoObj = new Date(latestDateObj);
    weekAgoObj.setDate(weekAgoObj.getDate() - 7);
    
    // Top 10 Today
    const todayData = data.filter(r => getDate(r) === latestDate);
    renderTopTable(todayData, '#top-today-table tbody');
    
    // Top 10 Week
    const weekData = data.filter(r => {
        const d = getDate(r);
        if (!d) return false;
        const dObj = new Date(d);
        return dObj >= weekAgoObj && dObj <= latestDateObj;
    });
    renderTopTable(weekData, '#top-week-table tbody');
}

function renderTopTable(data, selector) {
    const tbody = document.querySelector(selector);
    tbody.innerHTML = '';
    
    // Group by Bond Name
    const groups = {};
    data.forEach(row => {
        const name = row['Wind_Name_Final'] || row['bond_name'];
        if (!name) return;
        
        if (!groups[name]) groups[name] = { name, bid: 0, ofr: 0, total: 0 };
        
        if (row['direction'] === 'bid') groups[name].bid++;
        if (row['direction'] === 'ofr') groups[name].ofr++;
        groups[name].total++;
    });
    
    const sorted = Object.values(groups).sort((a, b) => b.total - a.total).slice(0, 10);
    
    if (sorted.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center">无数据</td></tr>';
        return;
    }
    
    sorted.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="text-truncate" style="max-width: 150px;" title="${item.name}">${item.name}</td>
            <td><span class="text-success">${item.bid}</span> / <span class="text-danger">${item.ofr}</span></td>
            <td class="fw-bold">${item.total}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderInstBehaviorTable(data) {
    const tbody = document.querySelector('#inst-behavior-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (data.length === 0) return;
    
    // Rating Logic: High >= AA+, Low <= AA
    // Need a helper to parse ratings
    const isHighRating = (rating) => {
        if (!rating) return false;
        const r = rating.trim().toUpperCase();
        // High: AAA+, AAA, AAA-, AA+
        // Low: AA, AA(2), AA-, A+, ...
        const highSet = ['AAA+', 'AAA', 'AAA-', 'AA+'];
        return highSet.includes(r);
    };
    
    // Group by Institution
    const stats = {};
    let totalBid = 0;
    let totalBidHigh = 0;
    let totalOfr = 0;
    let totalOfrHigh = 0;
    
    data.forEach(row => {
        const inst = row['Institution'];
        if (!inst || inst === 'Unknown') return;
        
        if (!stats[inst]) {
            stats[inst] = { 
                name: inst, 
                bidTotal: 0, bidHigh: 0, 
                ofrTotal: 0, ofrHigh: 0 
            };
        }
        
        const rating = row['Implied_Rating'];
        const isHigh = isHighRating(rating);
        const hasRating = rating && rating.trim().length > 0;
        
        if (row['direction'] === 'bid') {
            stats[inst].bidTotal++;
            if (hasRating && isHigh) stats[inst].bidHigh++;
            
            // Global stats
            totalBid++;
            if (hasRating && isHigh) totalBidHigh++;
        }
        else if (row['direction'] === 'ofr') {
            stats[inst].ofrTotal++;
            if (hasRating && isHigh) stats[inst].ofrHigh++;
            
            // Global stats
            totalOfr++;
            if (hasRating && isHigh) totalOfrHigh++;
        }
    });
    
    // Convert to array
    const resultList = Object.values(stats);
    
    // Sort by total activity (desc)
    resultList.sort((a, b) => (b.bidTotal + b.ofrTotal) - (a.bidTotal + a.ofrTotal));
    
    // Helper for percentage
    const calcPct = (num, total) => {
        if (total === 0) return '-';
        return ((num / total) * 100).toFixed(1) + '%';
    };
    
    // Add Global Row
    const globalRow = document.createElement('tr');
    globalRow.classList.add('table-secondary', 'fw-bold');
    globalRow.innerHTML = `
        <td>整体市场 (Market Total)</td>
        <td>${totalBid}</td>
        <td class="text-success">${calcPct(totalBidHigh, totalBid)}</td>
        <td class="text-secondary">${calcPct(totalBid - totalBidHigh, totalBid)}</td>
        <td>${totalOfr}</td>
        <td class="text-danger">${calcPct(totalOfrHigh, totalOfr)}</td>
        <td class="text-secondary">${calcPct(totalOfr - totalOfrHigh, totalOfr)}</td>
    `;
    tbody.appendChild(globalRow);
    
    // Add Top 50 Institutions
    resultList.slice(0, 50).forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="text-truncate" style="max-width: 150px;" title="${item.name}">${item.name}</td>
            <td>${item.bidTotal}</td>
            <td class="text-success">${calcPct(item.bidHigh, item.bidTotal)}</td>
            <td class="text-muted">${calcPct(item.bidTotal - item.bidHigh, item.bidTotal)}</td>
            <td>${item.ofrTotal}</td>
            <td class="text-danger">${calcPct(item.ofrHigh, item.ofrTotal)}</td>
            <td class="text-muted">${calcPct(item.ofrTotal - item.ofrHigh, item.ofrTotal)}</td>
        `;
        tbody.appendChild(tr);
    });
}

function initSpecificQuotesControl() {
    const select = document.getElementById('quotes-filter-mode');
    if (!select) return;
    
    // Clone to remove old listeners
    const newSelect = select.cloneNode(true);
    select.parentNode.replaceChild(newSelect, select);
    
    newSelect.addEventListener('change', (e) => {
        renderSpecificQuotesTable(globalData, e.target.value);
    });
}

function renderSpecificQuotesTable(data, mode) {
    const tbody = document.querySelector('#specific-quotes-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (data.length === 0) return;
    
    let sorted = [];
    
    if (mode === 'rating_asc') {
        // Rating Value Map (Lower value = Lower Rating)
        const ratingMap = {
            'AAA+': 100, 'AAA': 95, 'AAA-': 90,
            'AA+': 85, 'AA': 80, 'AA(2)': 75, 'AA-': 70,
            'A+': 65, 'A': 60, 'A-': 55,
            'BBB+': 50, 'BBB': 45, 'BBB-': 40,
            'BB+': 35, 'BB': 30, 'BB-': 25,
            'B+': 20, 'B': 15, 'B-': 10,
            'C': 5
        };
        
        const getRatingScore = (r) => {
            if (!r) return 999; 
            const key = r.trim().toUpperCase();
            return ratingMap[key] || 999;
        };
        
        // Filter rows that have a rating
        sorted = data.filter(r => r['Implied_Rating'] && r['Implied_Rating'].trim().length > 0)
            .sort((a, b) => {
                const scoreA = getRatingScore(a['Implied_Rating']);
                const scoreB = getRatingScore(b['Implied_Rating']);
                if (scoreA !== scoreB) return scoreA - scoreB;
                return (b['timestamp'] || '').localeCompare(a['timestamp'] || '');
            });

    } else if (mode === 'duration_desc') {
        // Filter valid duration
        sorted = data.filter(r => {
            const d = parseFloat(r['Mod_Duration']);
            return !isNaN(d) && d > 0;
        }).sort((a, b) => {
            return parseFloat(b['Mod_Duration']) - parseFloat(a['Mod_Duration']);
        });

    } else if (mode === 'yield_desc') {
        // Filter valid yield
        sorted = data.filter(r => {
            const y = parseFloat(r['Val_Yield']);
            return !isNaN(y) && y > 0 && y < 100; // Sanity check < 100%
        }).sort((a, b) => {
            return parseFloat(b['Val_Yield']) - parseFloat(a['Val_Yield']);
        });
    }
    
    if (sorted.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">无符合条件的数据</td></tr>';
        return;
    }
    
    // Top 50
    sorted.slice(0, 50).forEach(row => {
        const tr = document.createElement('tr');
        const directionColor = row['direction'] === 'bid' ? 'text-success' : (row['direction'] === 'ofr' ? 'text-danger' : '');
        
        tr.innerHTML = `
            <td class="fw-bold">${row['Implied_Rating'] || '-'}</td>
            <td>${row['Wind_Code_Final'] || row['bond_code'] || '-'}</td>
            <td title="${row['Wind_Name_Final'] || row['bond_name']}">${row['Wind_Name_Final'] || row['bond_name'] || '-'}</td>
            <td class="${directionColor}">${row['direction'] || '-'}</td>
            <td>${row['Val_Yield'] || row['price'] || '-'}</td>
            <td>${row['Mod_Duration'] || '-'}</td>
            <td class="text-truncate" style="max-width: 100px;" title="${row['sender'] || row['Institution']}">${row['sender'] || row['Institution'] || '-'}</td>
            <td class="small text-muted">${row['timestamp'] ? row['timestamp'].substring(5, 16) : '-'}</td>
            <td class="text-truncate" style="max-width: 200px;" title="${row['content'] || ''}">${row['content'] || '-'}</td>
        `;
        tbody.appendChild(tr);
    });
}
