function renderCharts(data) {
    if (!data || data.length === 0) return;
    
    // --- 1. Line Chart (Daily Bid/Ofr) ---
    renderLineChart(data);
    
    // --- 2. Scatter Plot (Duration vs Yield) ---
    renderScatterPlot(data);
    
    // --- 3. Market Heatmap (Rating vs Duration) ---
    renderHeatmap(data);

    // --- 4. Active Traders (Top 20) ---
    renderActiveTradersChart(data);
}

function renderLineChart(data) {
    // Force redraw by clearing container completely
    d3.select("#line-chart").selectAll("*").remove();
    const container = document.getElementById('line-chart');
    const width = container.clientWidth || 800; // Fallback width
    const height = container.clientHeight || 400; // Fallback height
    const margin = { top: 20, right: 30, bottom: 30, left: 40 };

    // Group by Date
    const dailyCounts = {};
    data.forEach(row => {
        const date = row['Quote_Date'] || (row['timestamp'] ? row['timestamp'].substring(0, 10) : '');
        if (!date) return;
        
        if (!dailyCounts[date]) dailyCounts[date] = { date, bid: 0, ofr: 0 };
        if (row['direction'] === 'bid') dailyCounts[date].bid++;
        if (row['direction'] === 'ofr') dailyCounts[date].ofr++;
    });
    
    const chartData = Object.values(dailyCounts).sort((a, b) => new Date(a.date) - new Date(b.date));
    
    if (chartData.length === 0) return;

    // Scales
    const x = d3.scaleBand()
        .domain(chartData.map(d => d.date))
        .range([margin.left, width - margin.right])
        .padding(0.1);

    const y = d3.scaleLinear()
        .domain([0, d3.max(chartData, d => Math.max(d.bid, d.ofr))])
        .nice()
        .range([height - margin.bottom, margin.top]);

    const svg = d3.select("#line-chart").append("svg")
        .attr("width", width)
        .attr("height", height);

    // X Axis
    svg.append("g")
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x).tickValues(x.domain().filter((d, i) => i % Math.ceil(chartData.length / 10) === 0))) // Sparse ticks
        .selectAll("text")
        .style("text-anchor", "end")
        .attr("dx", "-.8em")
        .attr("dy", ".15em")
        .attr("transform", "rotate(-45)");

    // Y Axis
    svg.append("g")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y));

    // Lines
    const lineBid = d3.line()
        .x(d => x(d.date) + x.bandwidth() / 2)
        .y(d => y(d.bid));

    const lineOfr = d3.line()
        .x(d => x(d.date) + x.bandwidth() / 2)
        .y(d => y(d.ofr));

    svg.append("path")
        .datum(chartData)
        .attr("fill", "none")
        .attr("stroke", "#198754") // Success green
        .attr("stroke-width", 2)
        .attr("d", lineBid);

    svg.append("path")
        .datum(chartData)
        .attr("fill", "none")
        .attr("stroke", "#dc3545") // Danger red
        .attr("stroke-width", 2)
        .attr("d", lineOfr);
        
    // Legend
    svg.append("circle").attr("cx", width - 100).attr("cy", 30).attr("r", 4).style("fill", "#198754")
    svg.append("text").attr("x", width - 90).attr("y", 30).text("Bid").style("font-size", "12px").attr("alignment-baseline","middle")
    svg.append("circle").attr("cx", width - 100).attr("cy", 50).attr("r", 4).style("fill", "#dc3545")
    svg.append("text").attr("x", width - 90).attr("y", 50).text("Ofr").style("font-size", "12px").attr("alignment-baseline","middle")
}

function renderScatterPlot(data) {
    // Force redraw
    d3.select("#scatter-chart").selectAll("*").remove();
    const container = document.getElementById('scatter-chart');
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 500;
    const margin = { top: 20, right: 30, bottom: 40, left: 50 };
    
    // Filter last week
    const dates = data.map(r => r['Quote_Date'] || (r['timestamp'] ? r['timestamp'].substring(0, 10) : '')).sort();
    const latestDateStr = dates[dates.length - 1];
    if (!latestDateStr) return;
    
    const latest = new Date(latestDateStr);
    const weekAgo = new Date(latest);
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    // Get Filter Values
    const filterType = document.getElementById('scatter-filter-type') ? document.getElementById('scatter-filter-type').value : 'all';
    const filterInst = document.getElementById('scatter-filter-inst') ? document.getElementById('scatter-filter-inst').value.trim().toLowerCase() : '';

    const scatterData = data.filter(r => {
        // 1. Exclude 'ref' and unknown direction
        if (r['direction'] === 'ref' || r['direction'] === '无法判断') return false;
        
        // 2. Date Filter
        const d = r['Quote_Date'] || (r['timestamp'] ? r['timestamp'].substring(0, 10) : '');
        if (!d) return false;
        const dObj = new Date(d);
        if (dObj < weekAgo || dObj > latest) return false;
        
        // 3. Institution Type Filter
        if (filterType !== 'all') {
            if (r['Inst_Type'] !== filterType) return false;
        }
        
        // 4. Institution Name Filter
        if (filterInst) {
            const inst = (r['Institution'] || '').toLowerCase();
            if (!inst.includes(filterInst)) return false;
        }
        
        return true;
    }).map(r => ({
        x: parseFloat(r['Mod_Duration']),
        y: parseFloat(r['Val_Yield']),
        type: r['direction'],
        name: r['Wind_Name_Final'] || r['bond_name'],
        sender: r['sender'] || r['Institution'] || '',
        instType: r['Inst_Type'] || ''
    })).filter(d => !isNaN(d.x) && !isNaN(d.y) && d.x > 0 && d.y > 0);
    
    if (scatterData.length === 0) return;

    // Scales
    const x = d3.scaleLinear()
        .domain([0, d3.max(scatterData, d => d.x) * 1.1])
        .range([margin.left, width - margin.right]);

    const y = d3.scaleLinear()
        .domain([0, d3.max(scatterData, d => d.y) * 1.1])
        .range([height - margin.bottom, margin.top]);

    const svg = d3.select("#scatter-chart").append("svg")
        .attr("width", width)
        .attr("height", height);

    // Axis
    svg.append("g")
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x));
    
    svg.append("text")
        .attr("text-anchor", "end")
        .attr("x", width / 2)
        .attr("y", height - 5)
        .text("修正久期 (年)")
        .style("font-size", "12px");

    svg.append("g")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y));
        
    svg.append("text")
        .attr("text-anchor", "end")
        .attr("transform", "rotate(-90)")
        .attr("y", 15)
        .attr("x", -height / 2)
        .text("估值收益率 (%)")
        .style("font-size", "12px");

    // Tooltip
    const tooltip = d3.select("#scatter-tooltip");

    // Dots Group
    const dotGroup = svg.append("g");

    // Interactive Legend
    const legendData = [
        { type: 'bid', color: "#198754", label: "Bid" },
        { type: 'ofr', color: "#dc3545", label: "Ofr" }
    ];
    
    // Track visibility state
    const visibility = { bid: true, ofr: true };

    const legend = svg.selectAll(".legend")
        .data(legendData)
        .enter().append("g")
        .attr("class", "legend")
        .attr("transform", (d, i) => `translate(${width - 100}, ${30 + i * 20})`)
        .style("cursor", "pointer")
        .on("click", function(event, d) {
            // Toggle visibility
            visibility[d.type] = !visibility[d.type];
            
            // Update dots
            dotGroup.selectAll("circle")
                .filter(dot => dot.type === d.type)
                .transition().duration(300)
                .style("opacity", visibility[d.type] ? 0.6 : 0);
                
            // Update legend style (fade out if hidden)
            d3.select(this).style("opacity", visibility[d.type] ? 1 : 0.5);
        });

    legend.append("circle")
        .attr("r", 4)
        .style("fill", d => d.color);

    legend.append("text")
        .attr("x", 10)
        .attr("y", 0)
        .attr("dy", ".35em")
        .text(d => d.label);

    // Draw Dots
    dotGroup.selectAll("circle")
        .data(scatterData)
        .enter()
        .append("circle")
        .attr("cx", d => x(d.x))
        .attr("cy", d => y(d.y))
        .attr("r", 4)
        .style("fill", d => d.type === 'bid' ? "#198754" : "#dc3545")
        .style("opacity", 0.6)
        .on("mouseover", function(event, d) {
            if (!visibility[d.type]) return; // Don't show tooltip if hidden

            d3.select(this).attr("r", 7).style("opacity", 1);
            
            // Calculate position relative to container, not page
            // This places tooltip near the dot
            const [mx, my] = d3.pointer(event, container);
            
            tooltip.style("opacity", 1)
                .html(`
                    <div style="text-align: left;">
                        <b>${d.name}</b><br>
                        <span style="color:#aaa">Sender:</span> ${d.sender}<br>
                        <span style="color:#aaa">久期:</span> ${d.x.toFixed(2)}<br>
                        <span style="color:#aaa">收益率:</span> ${d.y.toFixed(2)}%
                    </div>
                `)
                .style("left", (mx + 10) + "px") // Offset slightly
                .style("top", (my - 10) + "px");
        })
        .on("mouseout", function(d) {
            if (!visibility[d.type]) return;
            d3.select(this).attr("r", 4).style("opacity", 0.6);
            tooltip.style("opacity", 0);
        });
}

function renderHeatmap(data) {
    // Force redraw
    d3.select("#heatmap-chart").selectAll("*").remove();
    const container = document.getElementById('heatmap-chart');
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 400;
    const margin = { top: 20, right: 30, bottom: 50, left: 50 };
    
    const metric = document.getElementById('heatmap-metric') ? document.getElementById('heatmap-metric').value : 'total';

    // 1. Process Data
    // X: Implied_Rating, Y: Duration Buckets
    // X Axis Categories: AAA+, AAA, AAA-, AA+, AA, AA(2), AA-, A+, A, Other
    
    const ratingOrder = ['AAA+', 'AAA', 'AAA-', 'AA+', 'AA', 'AA(2)', 'AA-', 'A+', 'A', 'Other'];
    const durationOrder = ['< 1Y', '1-3Y', '3-5Y', '5-7Y', '7-10Y', '> 10Y'];
    
    const getDurationBucket = (dur) => {
        const d = parseFloat(dur);
        if (isNaN(d)) return null;
        if (d < 1) return '< 1Y';
        if (d < 3) return '1-3Y';
        if (d < 5) return '3-5Y';
        if (d < 7) return '5-7Y';
        if (d < 10) return '7-10Y';
        return '> 10Y';
    };
    
    const getRatingBucket = (rating) => {
        if (!rating) return 'Other';
        // Simple mapping, Wind might have 'AAA', 'AAA-', etc.
        // Assuming standard ratings. If not in list, group to Other or keep as is?
        // Let's try to map to base ratings or 'Other'
        const r = rating.trim().toUpperCase();
        // Remove stable/outlook suffixes if any? usually rating is clean.
        if (ratingOrder.includes(r)) return r;
        return 'Other';
    };

    // Initialize Matrix
    const heatmapData = [];
    ratingOrder.forEach(r => {
        durationOrder.forEach(d => {
            heatmapData.push({ rating: r, duration: d, count: 0, bid: 0, ofr: 0 });
        });
    });
    
    // Fill Matrix
    data.forEach(row => {
        const dur = getDurationBucket(row['Mod_Duration']);
        const rat = getRatingBucket(row['Implied_Rating']);
        
        if (dur && rat) {
            const item = heatmapData.find(d => d.rating === rat && d.duration === dur);
            if (item) {
                if (row['direction'] === 'bid') item.bid++;
                if (row['direction'] === 'ofr') item.ofr++;
                item.count++;
            }
        }
    });
    
    // Determine Value for Coloring
    heatmapData.forEach(d => {
        d.value = metric === 'total' ? d.count : (metric === 'bid' ? d.bid : d.ofr);
    });
    
    const maxValue = d3.max(heatmapData, d => d.value) || 1;

    // Scales
    const x = d3.scaleBand()
        .range([margin.left, width - margin.right])
        .domain(ratingOrder)
        .padding(0.05);
        
    const y = d3.scaleBand()
        .range([height - margin.bottom, margin.top])
        .domain(durationOrder)
        .padding(0.05);
        
    const colorScale = d3.scaleSequential()
        .interpolator(d3.interpolateBlues)
        .domain([0, maxValue]);

    const svg = d3.select("#heatmap-chart").append("svg")
        .attr("width", width)
        .attr("height", height);

    // X Axis
    svg.append("g")
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x))
        .selectAll("text")
        .style("text-anchor", "middle");
        
    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("x", width / 2)
        .attr("y", height - 10)
        .text("隐含评级")
        .style("font-size", "12px");

    // Y Axis
    svg.append("g")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y));
        
    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("transform", "rotate(-90)")
        .attr("y", 15)
        .attr("x", -height / 2)
        .text("剩余期限")
        .style("font-size", "12px");

    // Tooltip
    const tooltip = d3.select("#heatmap-tooltip");

    // Cells
    svg.selectAll()
        .data(heatmapData)
        .enter()
        .append("rect")
        .attr("x", d => x(d.rating))
        .attr("y", d => y(d.duration))
        .attr("width", x.bandwidth())
        .attr("height", y.bandwidth())
        .style("fill", d => d.value === 0 ? "#f8f9fa" : colorScale(d.value))
        .style("stroke", "#dee2e6")
        .on("mouseover", function(event, d) {
            d3.select(this).style("stroke", "black").style("stroke-width", 2);
            
            const [mx, my] = d3.pointer(event, container);
            
            tooltip.style("opacity", 1)
                .html(`
                    <div style="text-align: left;">
                        <b>评级: ${d.rating} | 期限: ${d.duration}</b><br>
                        总报价: ${d.count}<br>
                        <span style="color:#198754">Bid: ${d.bid}</span><br>
                        <span style="color:#dc3545">Ofr: ${d.ofr}</span>
                    </div>
                `)
                .style("left", (mx + 10) + "px")
                .style("top", (my - 10) + "px");
        })
        .on("mouseout", function(d) {
            d3.select(this).style("stroke", "#dee2e6").style("stroke-width", 1);
            tooltip.style("opacity", 0);
        });
        
    // Add text labels for counts if cell is large enough
    svg.selectAll()
        .data(heatmapData)
        .enter()
        .filter(d => d.value > 0)
        .append("text")
        .attr("x", d => x(d.rating) + x.bandwidth() / 2)
        .attr("y", d => y(d.duration) + y.bandwidth() / 2)
        .attr("dy", ".35em")
        .text(d => d.value)
        .attr("text-anchor", "middle")
        .style("fill", d => d.value > maxValue / 2 ? "white" : "black")
        .style("font-size", "10px")
        .style("pointer-events", "none");
}

function renderActiveTradersChart(data) {
    // Force redraw
    d3.select("#active-traders-chart").selectAll("*").remove();
    const container = document.getElementById('active-traders-chart');
    if (!container) return; // Guard clause

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 500;
    const margin = { top: 20, right: 30, bottom: 20, left: 150 }; // Larger left margin for names

    try {
        // 1. Process Data: Count per sender
        const counts = {};
        data.forEach(row => {
            // Flexible key matching for Sender
            const senderKey = Object.keys(row).find(k => k.toLowerCase() === 'sender') || 
                              Object.keys(row).find(k => k.toLowerCase() === 'institution');
            
            const sender = senderKey ? row[senderKey] : null;
            
            if (!sender || sender === 'Unknown') return;
            
            // Flexible key matching for Direction
            const dirKey = Object.keys(row).find(k => k.toLowerCase() === 'direction');
            const direction = dirKey ? (row[dirKey] || '').toLowerCase() : '';

            if (!counts[sender]) counts[sender] = { sender, total: 0, bid: 0, ofr: 0 };
            counts[sender].total++;
            if (direction === 'bid') counts[sender].bid++;
            if (direction === 'ofr') counts[sender].ofr++;
        });
        
        // Sort by total desc and take top 20
        const chartData = Object.values(counts)
            .sort((a, b) => b.total - a.total)
            .slice(0, 20);
            
        if (chartData.length === 0) {
            container.innerHTML = '<div class="d-flex justify-content-center align-items-center h-100 text-muted">无活跃交易员数据</div>';
            return;
        }

        // Scales
        const y = d3.scaleBand()
            .range([0, height - margin.top - margin.bottom])
            .domain(chartData.map(d => d.sender))
            .padding(0.2);
            
        const x = d3.scaleLinear()
            .range([0, width - margin.left - margin.right])
            .domain([0, d3.max(chartData, d => d.total) * 1.1]);

        const svg = d3.select("#active-traders-chart").append("svg")
            .attr("width", width)
            .attr("height", height)
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        // Axes
        svg.append("g")
            .call(d3.axisLeft(y));
            
        svg.append("g")
            .attr("transform", `translate(0,${height - margin.top - margin.bottom})`)
            .call(d3.axisBottom(x).ticks(5));

        // Bars
        const stackGen = d3.stack().keys(['bid', 'ofr']);
        const stackedData = stackGen(chartData);
        
        const color = d3.scaleOrdinal()
            .domain(['bid', 'ofr'])
            .range(["#198754", "#dc3545"]); // Green, Red

        svg.append("g")
            .selectAll("g")
            .data(stackedData)
            .join("g")
            .attr("fill", d => color(d.key))
            .selectAll("rect")
            .data(d => d)
            .join("rect")
            .attr("y", d => y(d.data.sender))
            .attr("x", d => x(d[0]))
            .attr("width", d => x(d[1]) - x(d[0]))
            .attr("height", y.bandwidth());
            
        // Add Total Labels at the end of bars
        svg.append("g")
            .selectAll("text")
            .data(chartData)
            .join("text")
            .attr("y", d => y(d.sender) + y.bandwidth() / 2)
            .attr("x", d => x(d.total) + 5)
            .attr("dy", ".35em")
            .text(d => d.total)
            .style("font-size", "10px");
            
        // Tooltip
        const tooltip = d3.select("#traders-tooltip");
        
        // Add invisible overlay for tooltip on the whole bar area
        svg.append("g")
            .selectAll("rect")
            .data(chartData)
            .join("rect")
            .attr("y", d => y(d.sender))
            .attr("x", 0)
            .attr("width", width)
            .attr("height", y.bandwidth())
            .style("opacity", 0)
            .on("mouseover", function(event, d) {
                d3.select(this).style("opacity", 0.1).style("fill", "gray");
                
                const [mx, my] = d3.pointer(event, container);
                
                tooltip.style("opacity", 1)
                    .html(`
                        <div style="text-align: left;">
                            <b>${d.sender}</b><br>
                            Total: ${d.total}<br>
                            <span style="color:#198754">Bid: ${d.bid}</span><br>
                            <span style="color:#dc3545">Ofr: ${d.ofr}</span>
                        </div>
                    `)
                    .style("left", (mx + 10) + "px")
                    .style("top", (my + 10) + "px"); // Adjust y to not block
            })
            .on("mouseout", function() {
                d3.select(this).style("opacity", 0);
                tooltip.style("opacity", 0);
            });
    } catch (e) {
        console.error("Error rendering Active Traders Chart:", e);
        container.innerHTML = `<div class="alert alert-danger">图表渲染错误: ${e.message}</div>`;
    }
}