(() => {
  // Tiny Farm — multi-plot support with buyable plots
  const MONEY_KEY = 'tinyfarm_money_v1';
  const PLOTS_KEY = 'tinyfarm_plots_v1';
  const INV_KEY = 'tinyfarm_inv_v1';
  const FARM_NAME_KEY = 'tinyfarm_name_v1';

  const PLANTS = {
    carrot: { name: 'Carrot', grow: 10, price: 2, seedCost: 0 },
    turnip: { name: 'Turnip', grow: 8, price: 5, seedCost: 2 }
  };

  // Farmers
  // Assumption: each farmer costs $150 to hire. Farmers can be assigned to a single plot and will
  // automatically harvest that plot when the crop is ready.
  const FARMERS_KEY = 'tinyfarm_farmers_v1';
  const FARMER_COST = 150;

  // Helpers
  const $ = id => document.getElementById(id);
  function saveJSON(k, v){ localStorage.setItem(k, JSON.stringify(v)); }
  function loadJSON(k, fallback){ try{ const r = localStorage.getItem(k); return r ? JSON.parse(r) : fallback; } catch(e){ return fallback; } }
  function saveNumber(k, n){ localStorage.setItem(k, String(n)); }
  function loadNumber(k, fallback){ const r = localStorage.getItem(k); const n = parseInt(r,10); return Number.isFinite(n) ? n : fallback; }
  function saveString(k, s){ localStorage.setItem(k, String(s)); }
  function loadString(k, fallback){ const r = localStorage.getItem(k); return (r === null || r === undefined) ? fallback : String(r); }
  function fmt(n){ return '$' + n.toLocaleString(); }

  // DOM
  const moneyEl = $('money');
  const plotsContainer = $('plots');
  const inventoryEl = $('inventory');
  const marketEl = $('market');
  const seedTray = $('seed-tray');
  const resetBtn = $('reset-btn');
  const buyPlotBtn = $('buy-plot-btn');
  const farmNameEl = $('farm-name');
  const editNameBtn = $('edit-name-btn');

  // State
  let money = loadNumber(MONEY_KEY, 0);
  let plots = loadJSON(PLOTS_KEY, [null]); // array of null or {plantId, plantedAt}
  let inventory = loadJSON(INV_KEY, {});
  let farmName = loadString(FARM_NAME_KEY, 'Tiny Farm');

  // Farmers state: array of { id: number, assignedPlot: number|null }
  let farmers = loadJSON(FARMERS_KEY, []);
  // helper for temporary assign mode: stores farmer id when user clicks "Assign" and then clicks a plot
  let assigningFarmerId = null;

  // Plot cost formula:
  // - First purchased plot (when player has only the starter plot) costs $75
  // - Subsequent plots follow the previous simple formula: 100 * (currentCount + 1)
  function nextPlotCost(){
    if (plots.length === 1) return 75;
    return 100 * (plots.length + 1);
  }

  function saveAll(){ saveNumber(MONEY_KEY, money); saveJSON(PLOTS_KEY, plots); saveJSON(INV_KEY, inventory); saveString(FARM_NAME_KEY, farmName); saveJSON(FARMERS_KEY, farmers); }

  // Rendering
  function updateMoney(){ if(moneyEl) moneyEl.textContent = fmt(money); updateBuyPlotButton(); }

  function renderFarmName(){ if(farmNameEl) farmNameEl.textContent = farmName || 'Tiny Farm'; }

  function renderInventory(){ if(!inventoryEl) return; inventoryEl.innerHTML = ''; const keys = Object.keys(inventory).filter(k=>inventory[k]>0); if(keys.length===0){ inventoryEl.innerHTML = '<li class="muted">No crops</li>'; return; } keys.forEach(id=>{ const li=document.createElement('li'); const left=document.createElement('span'); left.textContent = `${PLANTS[id].name} x ${inventory[id]}`; const right=document.createElement('div'); const btn1=document.createElement('button'); btn1.textContent='Sell 1'; btn1.addEventListener('click', ()=>sellOne(id)); const btnAll=document.createElement('button'); btnAll.textContent='Sell All'; btnAll.style.marginLeft='6px'; btnAll.addEventListener('click', ()=>sellAll(id)); right.appendChild(btn1); right.appendChild(btnAll); li.appendChild(left); li.appendChild(right); inventoryEl.appendChild(li); }); }

  function renderMarket(){ if(!marketEl) return; marketEl.innerHTML=''; Object.keys(PLANTS).forEach(id=>{ const row=document.createElement('div'); row.className='market-row'; const left=document.createElement('div'); left.textContent = `${PLANTS[id].name} — Sell $${PLANTS[id].price}`; const sellBtn=document.createElement('button'); sellBtn.textContent='Sell All'; sellBtn.addEventListener('click', ()=>sellAll(id)); row.appendChild(left); row.appendChild(sellBtn); marketEl.appendChild(row); }); }

  // Farmers UI
  function renderFarmersList(){ const list = $('farmers-list'); if(!list) return; list.innerHTML = ''; if(!farmers || farmers.length===0){ const p = document.createElement('div'); p.className='muted'; p.textContent = 'No farmers hired'; list.appendChild(p); } else {
      farmers.forEach(f=>{
        const row = document.createElement('div'); row.className = 'farmer-row';
        const left = document.createElement('div'); left.textContent = `Farmer #${f.id} — ${f.assignedPlot!==null? 'Plot ' + (f.assignedPlot+1) : 'Unassigned'}`;
        const right = document.createElement('div');
        const assignBtn = document.createElement('button'); assignBtn.textContent = f.assignedPlot===null ? 'Assign' : 'Reassign'; assignBtn.addEventListener('click', ()=>{ // start assign mode
          assigningFarmerId = f.id; if(plotsContainer) plotsContainer.classList.add('assigning');
        });
        const unassignBtn = document.createElement('button'); unassignBtn.textContent = 'Unassign'; unassignBtn.style.marginLeft='6px'; unassignBtn.addEventListener('click', ()=>{ const ff = farmers.find(x=>x.id===f.id); if(ff){ ff.assignedPlot = null; saveJSON(FARMERS_KEY,farmers); renderFarmersList(); renderPlots(); } });
        const fireBtn = document.createElement('button'); fireBtn.textContent='Fire'; fireBtn.style.marginLeft='6px'; fireBtn.addEventListener('click', ()=>{ if(!confirm('Fire this farmer?')) return; farmers = farmers.filter(x=>x.id!==f.id); saveJSON(FARMERS_KEY,farmers); renderFarmersList(); renderPlots(); });
        right.appendChild(assignBtn); right.appendChild(unassignBtn); right.appendChild(fireBtn);
        row.appendChild(left); row.appendChild(right); list.appendChild(row);
      });
    }
    // hire button
    const hireWrap = document.createElement('div'); hireWrap.style.marginTop='10px'; const hireBtn = document.createElement('button'); hireBtn.textContent = `Hire Farmer — ${fmt(FARMER_COST)}`; hireBtn.disabled = money < FARMER_COST; hireBtn.addEventListener('click', ()=>{ if(money < FARMER_COST) return; if(!confirm(`Hire farmer for ${fmt(FARMER_COST)}?`)) return; money -= FARMER_COST; const newFarmer = { id: Date.now(), assignedPlot: null }; farmers.push(newFarmer); saveNumber(MONEY_KEY, money); saveJSON(FARMERS_KEY, farmers); updateMoney(); renderFarmersList(); }); hireWrap.appendChild(hireBtn); list.appendChild(hireWrap);
  }

  function openFarmersPanel(){ const panel = $('farmers-panel'); if(panel) { panel.hidden = false; renderFarmersList(); } }
  function closeFarmersPanel(){ const panel = $('farmers-panel'); if(panel) panel.hidden = true; assigningFarmerId = null; if(plotsContainer) plotsContainer.classList.remove('assigning'); }

  function createPlotElement(idx, data){
    const wrapper = document.createElement('div');
    wrapper.className = 'plot';
    wrapper.tabIndex = 0;
    wrapper.setAttribute('role','button');
    wrapper.dataset.index = String(idx);

    const inner = document.createElement('div'); inner.className = 'plot-inner';
    const seedIcon = document.createElement('div'); seedIcon.className = 'seed-icon'; seedIcon.textContent = '🌱';
    const progress = document.createElement('div'); progress.className = 'progress';
    const bar = document.createElement('div'); bar.className = 'bar'; bar.style.width = '0%'; progress.appendChild(bar);
    inner.appendChild(seedIcon); inner.appendChild(progress);
    wrapper.appendChild(inner);

    const label = document.createElement('div'); label.className = 'plot-label'; label.innerHTML = `Plot ${idx+1}<br><small class="plot-state">Empty</small>`;
    const stateEl = label.querySelector('.plot-state');
  // farmer badge
  const farmerBadge = document.createElement('div'); farmerBadge.className = 'farmer-badge'; farmerBadge.style.display = 'none'; farmerBadge.title = 'Assigned farmer';
  farmerBadge.textContent = '👩‍🌾';
  inner.appendChild(farmerBadge);

    // Update UI based on data
    function refresh(){
      const p = plots[idx];
      if(!p){ wrapper.classList.remove('planted'); stateEl.textContent = 'Empty'; wrapper.setAttribute('aria-label','Empty plot. Drag a seed here to plant'); bar.style.width='0%'; seedIcon.textContent='🌱';
      } else {
        const plant = PLANTS[p.plantId];
        const elapsed = Math.max(0, Math.floor((Date.now() - p.plantedAt)/1000));
        const pct = Math.min(100, Math.round((elapsed / plant.grow) * 100));
        bar.style.width = pct + '%';
        if(elapsed >= plant.grow){ stateEl.textContent = `${plant.name} — Ready`; seedIcon.textContent='🌾'; wrapper.setAttribute('aria-label', `${plant.name} ready to harvest. Click to harvest`); }
        else { stateEl.textContent = `${plant.name} — Growing (${elapsed}s / ${plant.grow}s)`; seedIcon.textContent='🌿'; wrapper.setAttribute('aria-label', `${plant.name} growing`); }
        wrapper.classList.add('planted');
      }
      // show farmer badge if a farmer is assigned to this plot (farmers state checked at render)
      try{
        const assigned = farmers && farmers.find && farmers.find(f=>f.assignedPlot === idx);
        if(assigned){ farmerBadge.style.display = 'block'; farmerBadge.title = `Farmer #${assigned.id} assigned to this plot`; }
        else { farmerBadge.style.display = 'none'; }
      }catch(e){ farmerBadge.style.display = 'none'; }
    }

    // Events
    wrapper.addEventListener('click', ()=>{
      // If we're in assign mode, assign this plot to the selected farmer
      if(assigningFarmerId !== null){
        const farmer = farmers.find(f=>f.id === assigningFarmerId);
        if(farmer){
          // prevent multiple farmers on same plot
          const already = farmers.find(f=>f.assignedPlot === idx && f.id !== farmer.id);
          if(already){
            // simple feedback: set title briefly
            const prev = document.title; document.title = 'Plot already has a farmer'; setTimeout(()=>document.title = prev, 800);
          } else {
            farmer.assignedPlot = idx;
            saveJSON(FARMERS_KEY, farmers);
            renderFarmersList();
            renderPlots();
          }
        }
        assigningFarmerId = null;
        if(plotsContainer) plotsContainer.classList.remove('assigning');
        return;
      }

      const p = plots[idx];
      if(!p) return; const plant = PLANTS[p.plantId]; const elapsed = Math.floor((Date.now()-p.plantedAt)/1000); if(elapsed>=plant.grow){ harvest(idx); }
    });
    wrapper.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); wrapper.click(); } });

    // drag/drop
    wrapper.addEventListener('dragover', (e)=>{ e.preventDefault(); e.dataTransfer.dropEffect='copy'; wrapper.classList.add('drag-over'); });
    wrapper.addEventListener('dragleave', ()=>{ wrapper.classList.remove('drag-over'); });
    wrapper.addEventListener('drop', (e)=>{ e.preventDefault(); wrapper.classList.remove('drag-over'); const pid = e.dataTransfer.getData('text/plain'); if(pid && PLANTS[pid] && !plots[idx]){ plantCrop(pid, idx); } });

    // expose refresh method
    wrapper._refresh = refresh;
    return {el: wrapper, labelEl: label, refresh};
  }

  function renderPlots(){ if(!plotsContainer) return; plotsContainer.innerHTML = ''; const elements = []; plots.forEach((p, idx)=>{ const {el,labelEl,refresh} = createPlotElement(idx,p); const container = document.createElement('div'); container.style.textAlign='center'; container.appendChild(el); container.appendChild(labelEl); plotsContainer.appendChild(container); elements.push({el,refresh}); }); // refresh immediately
    elements.forEach(x=>x.refresh());
  }

  // Planting / harvesting
  function plantCrop(plantId, idx){
    if(plots[idx]) return;
    const plant = PLANTS[plantId];
    if(!plant) return;
    const cost = Number(plant.seedCost || 0);
    if(cost > 0){
      if(money < cost){
        // not enough money to plant
        // simple feedback: flash document title briefly
        const prev = document.title;
        document.title = 'Not enough money';
        setTimeout(()=>document.title = prev, 800);
        return;
      }
      money -= cost;
      saveNumber(MONEY_KEY, money);
      updateMoney();
    }
    plots[idx] = { plantId, plantedAt: Date.now() };
    saveJSON(PLOTS_KEY, plots);
    renderPlots();
  }
  function harvest(idx){ if(!plots[idx]) return; const plant = PLANTS[plots[idx].plantId]; const elapsed = Math.floor((Date.now()-plots[idx].plantedAt)/1000); if(elapsed < plant.grow) return; inventory[plots[idx].plantId] = (inventory[plots[idx].plantId]||0) + 1; plots[idx] = null; saveJSON(INV_KEY, inventory); saveJSON(PLOTS_KEY, plots); renderPlots(); renderInventory(); }

  // Selling
  function sellOne(id){ if(!inventory[id]||inventory[id]<=0) return; inventory[id]--; money += PLANTS[id].price; saveJSON(INV_KEY, inventory); saveNumber(MONEY_KEY, money); updateMoney(); renderInventory(); }
  function sellAll(id){ const qty = inventory[id]||0; if(qty<=0) return; money += qty * PLANTS[id].price; inventory[id]=0; saveJSON(INV_KEY, inventory); saveNumber(MONEY_KEY, money); updateMoney(); renderInventory(); }

  // Buy plot
  function updateBuyPlotButton(){ if(!buyPlotBtn) return; const cost = nextPlotCost(); buyPlotBtn.textContent = `Buy Plot — ${fmt(cost)}`; buyPlotBtn.disabled = money < cost; }
  function buyPlot(){ const cost = nextPlotCost(); if(money < cost) return; money -= cost; plots.push(null); saveNumber(MONEY_KEY,money); saveJSON(PLOTS_KEY,plots); updateMoney(); renderPlots(); }

  // Reset
  function resetGame(){ if(!confirm('Reset game? This clears money, inventory and plots.')) return; money = 0; plots = [null]; inventory = {}; farmName = 'Tiny Farm'; saveAll(); renderPlots(); renderInventory(); renderFarmName(); updateMoney(); }

  // Ticker updates progress bars
  let ticker = null; function tick(){ // refresh each plot element by re-rendering entire plots to keep simple
    // Auto-harvest: farmers assigned to plots will harvest when the crop is ready
    try{
      if(farmers && farmers.length){
        farmers.forEach(f=>{
          const idx = f.assignedPlot;
          if(typeof idx === 'number' && !isNaN(idx) && plots[idx]){
            const plant = PLANTS[plots[idx].plantId];
            if(plant){ const elapsed = Math.floor((Date.now()-plots[idx].plantedAt)/1000); if(elapsed >= plant.grow){ harvest(idx); } }
          }
        });
      }
    }catch(e){ /* ignore */ }
    renderPlots(); }
  function startTicker(){ if(ticker) return; ticker = setInterval(tick, 1000); }
  function stopTicker(){ if(ticker){ clearInterval(ticker); ticker=null; } }

  // Seed tray dragstart
  function setupSeedTray(){ if(!seedTray) return; seedTray.querySelectorAll('[data-plant]').forEach(el=>{ el.addEventListener('dragstart', (e)=>{ e.dataTransfer.setData('text/plain', el.dataset.plant); e.dataTransfer.effectAllowed='copy'; }); // support click for touch fallback
    el.addEventListener('click', ()=>{ // select seed for tap-to-plant fallback
      // mark selected seed on tray
      seedTray.querySelectorAll('.seed').forEach(s=>s.classList.remove('selected'));
      el.classList.add('selected');
      // next tap on an empty plot will plant
      // attach a one-time click handler to container
      const handler = function(ev){ const target = ev.target; const plotEl = target.closest ? target.closest('.plot') : null; if(!plotEl) return; const idx = parseInt(plotEl.dataset.index,10); if(!isNaN(idx) && !plots[idx]){ plantCrop(el.dataset.plant, idx); el.classList.remove('selected'); try{ plotsContainerEl.removeEventListener('click', handler); }catch(e){} } };
      const plotsContainerEl = $('plots'); if(plotsContainerEl){ plotsContainerEl.addEventListener('click', handler); setTimeout(()=>{ // auto-clear selection after 8s
        el.classList.remove('selected');
        try{ plotsContainerEl.removeEventListener('click', handler); }catch(e){}
      }, 8000); }
    }); }); }

  // UI wiring and init
  function init(){
    renderFarmName(); renderInventory(); renderMarket(); renderPlots(); updateMoney();
    setupSeedTray(); startTicker();
    if(buyPlotBtn) buyPlotBtn.addEventListener('click', buyPlot);
    if(resetBtn) resetBtn.addEventListener('click', resetGame);
  // Farmers panel wiring
  const farmersBtn = $('farmers-btn');
  const farmersClose = $('farmers-close');
  if(farmersBtn) farmersBtn.addEventListener('click', ()=>{ const panel = $('farmers-panel'); if(panel){ panel.hidden = !panel.hidden; if(!panel.hidden) renderFarmersList(); } });
  if(farmersClose) farmersClose.addEventListener('click', ()=>{ closeFarmersPanel(); });
    if(editNameBtn) editNameBtn.addEventListener('click', ()=>{ const v = prompt('Enter farm name', farmName); if(v!==null){ const s=v.trim(); if(s.length){ farmName = s; saveString(FARM_NAME_KEY, farmName); renderFarmName(); } } });
    if(farmNameEl) farmNameEl.addEventListener('dblclick', ()=>{ const v = prompt('Enter farm name', farmName); if(v!==null){ const s=v.trim(); if(s.length){ farmName = s; saveString(FARM_NAME_KEY, farmName); renderFarmName(); } } });
    // update buy button when money changes (hook into global saveAll calls)
    // but also ensure it's correct now
    updateBuyPlotButton();
    // keyboard ESC no-op
    window.addEventListener('beforeunload', saveAll);

    // Ensure drops are allowed and provide a document-level drop fallback — some browsers may not dispatch drop on the nested plot element
    document.addEventListener('dragover', function(e){ e.preventDefault(); });
    document.addEventListener('drop', function(e){
      // if the drop was already handled by a plot element, do nothing
      try{
        const pid = e.dataTransfer.getData('text/plain');
        if(!pid) return;
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const plotEl = el && el.closest ? el.closest('.plot') : null;
        if(plotEl){ const idx = parseInt(plotEl.dataset.index,10); if(!isNaN(idx) && !plots[idx]){ plantCrop(pid, idx); } }
      }catch(err){ /* ignore */ }
    });
  }

  // startup
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

})();
 (function(){
	// Tiny Farm — single plot with Carrots
	const MONEY_KEY = 'tinyfarm_money_v1';
	const PLOT_KEY = 'tinyfarm_plot_v1';
	const INV_KEY = 'tinyfarm_inv_v1';

	const PLANTS = {
		carrot: { name: 'Carrot', grow: 10, price: 5 }
	};

	function $(id){ return document.getElementById(id); }

	const moneyEl = $('money');
	const plotEl = $('plot');
	const plotStateEl = $('plot-state');
	const progressBar = plotEl && plotEl.querySelector('.bar');
	const inventoryEl = $('inventory');
	const marketEl = $('market');
	const resetBtn = $('reset-btn');
	const farmNameEl = $('farm-name');
	const editNameBtn = $('edit-name-btn');

	const FARM_NAME_KEY = 'tinyfarm_name_v1';

	let money = loadNumber(MONEY_KEY, 0);
	let plot = loadJSON(PLOT_KEY, null);
	let inventory = loadJSON(INV_KEY, {});

	let ticker = null;

	function saveNumber(key, n){ localStorage.setItem(key, String(n)); }
	function saveJSON(key, obj){ localStorage.setItem(key, JSON.stringify(obj)); }
	function loadJSON(key, fallback){ try{ const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; } catch(e){ return fallback; } }
	function loadNumber(key, fallback){ const r = localStorage.getItem(key); const n = parseInt(r,10); return Number.isFinite(n) ? n : fallback; }
	function saveString(key, s){ localStorage.setItem(key, String(s)); }
	function loadString(key, fallback){ const r = localStorage.getItem(key); return (r === null || r === undefined) ? fallback : String(r); }
	function format(n){ return '$' + n.toLocaleString(); }

	function updateMoney(){ if(moneyEl) moneyEl.textContent = format(money); }

	// Farm name
	let farmName = loadString(FARM_NAME_KEY, 'Tiny Farm');
	function renderFarmName(){ if(farmNameEl) farmNameEl.textContent = farmName || 'Tiny Farm'; }
	function setFarmName(name){ farmName = name || 'Tiny Farm'; saveString(FARM_NAME_KEY, farmName); renderFarmName(); }

	function renderPlot(){
		if(!plotEl) return;
		if(!plot){
			plotEl.classList.remove('planted');
			plotStateEl.textContent = 'Empty';
			plotEl.setAttribute('aria-label', 'Empty plot. Click to plant');
			if(progressBar) progressBar.style.width = '0%';
			plotEl.querySelector('.seed-icon').textContent = '🌱';
		} else {
			const plant = PLANTS[plot.plantId];
			const now = Date.now();
			const elapsed = Math.max(0, Math.floor((now - plot.plantedAt)/1000));
			const pct = Math.min(100, Math.round((elapsed / plant.grow) * 100));
			if(progressBar) progressBar.style.width = pct + '%';
			if(elapsed >= plant.grow){
				plotStateEl.textContent = `${plant.name} — Ready to harvest`;
				plotEl.querySelector('.seed-icon').textContent = '🌾';
				plotEl.setAttribute('aria-label', `${plant.name} ready to harvest. Click to harvest`);
			} else {
				plotStateEl.textContent = `${plant.name} — Growing (${elapsed}s / ${plant.grow}s)`;
				plotEl.querySelector('.seed-icon').textContent = '🌿';
				plotEl.setAttribute('aria-label', `${plant.name} growing. ${elapsed} of ${plant.grow} seconds`);
			}
			plotEl.classList.add('planted');
		}
	}

	function renderInventory(){
		if(!inventoryEl) return;
		inventoryEl.innerHTML = '';
		const keys = Object.keys(inventory).filter(k => inventory[k] > 0);
		if(keys.length === 0){ inventoryEl.innerHTML = '<li class="muted">No crops</li>'; return; }
		keys.forEach(id => {
			const li = document.createElement('li');
			const left = document.createElement('span'); left.textContent = `${PLANTS[id].name} x ${inventory[id]}`;
			const right = document.createElement('div');
			const btnSell1 = document.createElement('button'); btnSell1.textContent = 'Sell 1'; btnSell1.addEventListener('click', ()=>{ sellOne(id); });
			const btnSellAll = document.createElement('button'); btnSellAll.textContent = 'Sell All'; btnSellAll.style.marginLeft='6px'; btnSellAll.addEventListener('click', ()=>{ sellAll(id); });
			right.appendChild(btnSell1); right.appendChild(btnSellAll);
			li.appendChild(left); li.appendChild(right);
			inventoryEl.appendChild(li);
		});
	}

	function renderMarket(){
		if(!marketEl) return;
		marketEl.innerHTML = '';
		Object.keys(PLANTS).forEach(id => {
			const row = document.createElement('div'); row.className = 'market-row';
			const left = document.createElement('div'); left.textContent = `${PLANTS[id].name} — Sell $${PLANTS[id].price}`;
			const sellBtn = document.createElement('button'); sellBtn.textContent = 'Sell All'; sellBtn.addEventListener('click', ()=>{ sellAll(id); });
			row.appendChild(left); row.appendChild(sellBtn); marketEl.appendChild(row);
		});
	}



	function plantCrop(id){ if(plot) return; plot = { plantId: id, plantedAt: Date.now() }; saveJSON(PLOT_KEY, plot); renderPlot(); }

	function harvest(){ if(!plot) return; const plant = PLANTS[plot.plantId]; const elapsed = Math.floor((Date.now()-plot.plantedAt)/1000); if(elapsed < plant.grow) return; inventory[plot.plantId] = (inventory[plot.plantId]||0) + 1; saveJSON(INV_KEY, inventory); plot = null; saveJSON(PLOT_KEY, plot); renderPlot(); renderInventory(); }

	function sellOne(id){ if(!inventory[id] || inventory[id] <= 0) return; inventory[id]--; money += PLANTS[id].price; saveJSON(INV_KEY, inventory); saveNumber(MONEY_KEY, money); updateMoney(); renderInventory(); }
	function sellAll(id){ const qty = inventory[id] || 0; if(qty <= 0) return; money += qty * PLANTS[id].price; inventory[id] = 0; saveJSON(INV_KEY, inventory); saveNumber(MONEY_KEY, money); updateMoney(); renderInventory(); }

	function resetGame(){ if(!confirm('Reset game? This clears money, inventory and plot.')) return; money = 0; plot = null; inventory = {}; saveNumber(MONEY_KEY, money); saveJSON(PLOT_KEY, plot); saveJSON(INV_KEY, inventory); updateMoney(); renderPlot(); renderInventory(); }

	function tick(){ renderPlot(); }
	function startTicker(){ if(ticker) return; ticker = setInterval(tick, 1000); }
	function stopTicker(){ if(ticker){ clearInterval(ticker); ticker = null; } }

	function setup(){
		if(plotEl){
			plotEl.addEventListener('click', ()=>{ if(!plot) { /* no-op: use seed tray to plant */ return; } else { const plant = PLANTS[plot.plantId]; const elapsed = Math.floor((Date.now()-plot.plantedAt)/1000); if(elapsed >= plant.grow) harvest(); } });
			plotEl.addEventListener('keydown', (e)=>{ if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); plotEl.click(); } });
		}

		// Farm name UI
		if(editNameBtn){ editNameBtn.addEventListener('click', function(){ const v = prompt('Enter farm name', farmName); if(v !== null){ const s = v.trim(); if(s.length) setFarmName(s); } }); }
		if(farmNameEl){ farmNameEl.addEventListener('dblclick', function(){ const v = prompt('Enter farm name', farmName); if(v !== null){ const s = v.trim(); if(s.length) setFarmName(s); } }); }

		// plantOptions/chooser removed - planting is via drag-and-drop from seed tray


		// chooser/overlay/cancel removed - not used with drag-and-drop seed tray

		// Drag & drop: seed tray -> plot
		const seedTray = document.getElementById('seed-tray');
		if(seedTray){
			seedTray.querySelectorAll('[data-plant]').forEach(el=>{
				el.addEventListener('dragstart', function(e){
					e.dataTransfer.setData('text/plain', el.dataset.plant);
					e.dataTransfer.effectAllowed = 'copy';
				});
			});
		}

		if(plotEl){
			plotEl.addEventListener('dragover', function(e){ e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; plotEl.classList.add('drag-over'); });
			plotEl.addEventListener('dragleave', function(e){ plotEl.classList.remove('drag-over'); });
			plotEl.addEventListener('drop', function(e){ e.preventDefault(); plotEl.classList.remove('drag-over'); const pid = e.dataTransfer.getData('text/plain'); if(pid && PLANTS[pid]){ plantCrop(pid); } });
		}
		if(resetBtn) resetBtn.addEventListener('click', resetGame);

		renderMarket(); renderInventory(); renderPlot(); renderFarmName(); updateMoney(); startTicker();
	}

	if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup); else setup();
	window.addEventListener('beforeunload', ()=>{ saveNumber(MONEY_KEY, money); saveJSON(PLOT_KEY, plot); saveJSON(INV_KEY, inventory); });

})();

