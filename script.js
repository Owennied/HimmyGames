(() => {
  // Tiny Farm — multi-plot support with buyable plots (variant-based crops)
  const MONEY_KEY = 'tinyfarm_money_v1';
  const PLOTS_KEY = 'tinyfarm_plots_v1';
  const INV_KEY = 'tinyfarm_inv_v1';
  const FARM_NAME_KEY = 'tinyfarm_name_v1';
  const FARMERS_KEY = 'tinyfarm_farmers_v1';
  const FARMER_COST = 150;
  const FARMER_COUNTER_KEY = 'tinyfarm_farmer_counter_v1';

  // Plants: base price is the normal variant price; multipliers apply for better variants
  const PLANTS = {
  carrot: { name: 'Carrot', grow: 3, price: 2, seedCost: 0,
      variants: { normal:{mul:1}, silver:{mul:2}, gold:{mul:4}, diamond:{mul:10} },
      variantOdds: { silver: 0.15, gold: 0.04, diamond: 0.01 }
    },
  turnip: { name: 'Turnip', grow: 10, price: 5, seedCost: 2,
      variants: { normal:{mul:1}, silver:{mul:2}, gold:{mul:4}, diamond:{mul:10} },
      variantOdds: { silver: 0.12, gold: 0.03, diamond: 0.005 }
    }
    ,
    tomato: { name: 'Tomato', grow: 20, price: 15, seedCost: 10,
      variants: { normal:{mul:1}, silver:{mul:2}, gold:{mul:4}, diamond:{mul:10} },
      // Assumption: moderate rarities; normal = remainder
      variantOdds: { silver: 0.12, gold: 0.04, diamond: 0.01 }
    }
  };

  // Small SVG thumbnails for seeds/plots. state can be 'idle'|'growing'|'harvest'
  function getPlantSVG(id, state){
    if(!id || id === 'empty'){
      return '<svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g><ellipse cx="12" cy="13" rx="3" ry="2" fill="#b88b6f"/></g></svg>';
    }
    if(id === 'carrot'){
      return '<svg width="36" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
        + '<g>'
        + '<path d="M6 2c0 0 2 1 3 3l-1 1 2 2 1-1 3 3-8 8-6-6 6-10z" fill="#f59e0b"/>'
        + '<path d="M11 3c0 0 1 1 2 2 1 1 2 2 2 2l1-1c0 0-1-2-3-3-2-1-4-0-4-0z" fill="#16a34a"/>'
        + '</g></svg>';
    }
    if(id === 'turnip'){
      return '<svg width="36" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
        + '<g>'
        + '<circle cx="12" cy="13" r="5" fill="#9f7aea"/>'
        + '<path d="M9 7c0 0 1-2 3-2s3 2 3 2 0 1-3 1-3-1-3-1z" fill="#16a34a"/>'
        + '</g></svg>';
    }
    return '';
  }

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

  // Ensure inventory entries are arrays of variant strings (migrate older numeric counts)
  function normalizeInventory(){
    Object.keys(inventory).forEach(id=>{
      if(!Array.isArray(inventory[id])){
        if(typeof inventory[id] === 'number'){
          const count = inventory[id];
          inventory[id] = Array.from({length: count}, ()=> 'normal');
        } else {
          inventory[id] = [];
        }
      }
    });
  }
  normalizeInventory();

  // Farmers state: array of { id: number, assignedPlot: number|null }
  let farmers = loadJSON(FARMERS_KEY, []);
  // persistent counter to give sequential farmer numbers
  let farmerCounter = loadNumber(FARMER_COUNTER_KEY, 0);
  if((!farmerCounter || farmerCounter === 0) && Array.isArray(farmers) && farmers.length > 0){ farmerCounter = farmers.length; }

  let assigningFarmerId = null;
  let isDragging = false;

  function nextPlotCost(){ if (plots.length === 1) return 75; return 100 * (plots.length + 1); }
  function saveAll(){ saveNumber(MONEY_KEY, money); saveJSON(PLOTS_KEY, plots); saveJSON(INV_KEY, inventory); saveString(FARM_NAME_KEY, farmName); saveJSON(FARMERS_KEY, farmers); }

  // Determine variant for a harvested crop based on configured odds
  function sampleVariantFor(plantId){
    const p = PLANTS[plantId]; if(!p) return 'normal';
    const odds = p.variantOdds || {};
    const r = Math.random();
    if(odds.diamond && r < odds.diamond) return 'diamond';
    if(odds.gold && r < (odds.diamond || 0) + odds.gold) return 'gold';
    if(odds.silver && r < (odds.diamond || 0) + (odds.gold || 0) + odds.silver) return 'silver';
    return 'normal';
  }

  // Rendering
  function updateMoney(){ if(moneyEl) moneyEl.textContent = fmt(money); updateBuyPlotButton(); }
  function renderFarmName(){ if(farmNameEl) farmNameEl.textContent = farmName || 'Tiny Farm'; }

  function renderInventory(){
    if(!inventoryEl) return;
    inventoryEl.innerHTML = '';
    const keys = Object.keys(inventory).filter(k => Array.isArray(inventory[k]) ? inventory[k].length > 0 : (inventory[k] && inventory[k] > 0));
    if(keys.length === 0){ inventoryEl.innerHTML = '<li class="muted">No crops</li>'; return; }
    // Render one line per variant in the form: "Crop - Variant xAmount"
    keys.forEach(id => {
      const items = Array.isArray(inventory[id]) ? inventory[id] : [];
      // count variants
      const counts = items.reduce((acc, v)=>{ acc[v] = (acc[v]||0)+1; return acc; }, {});
      Object.keys(counts).filter(v => (counts[v]||0) > 0).forEach(variant => {
        const count = counts[variant];
        const li = document.createElement('li');
        const left = document.createElement('span');
  // Capitalize variant label for nicer display
  const variantLabel = variant.charAt(0).toUpperCase() + variant.slice(1);
  // Render as: "Variant Crop xAmount" (e.g. "Gold Carrot x1")
  left.textContent = `${variantLabel} ${PLANTS[id].name} x${count}`;
        const right = document.createElement('div');
        // Sell buttons target this specific variant
        const sell1 = document.createElement('button'); sell1.textContent = 'Sell 1'; sell1.addEventListener('click', ()=>sellOneVariant(id, variant));
        const sellAllVar = document.createElement('button'); sellAllVar.textContent = 'Sell All'; sellAllVar.style.marginLeft = '6px'; sellAllVar.addEventListener('click', ()=>sellAllVariant(id, variant));
        right.appendChild(sell1); right.appendChild(sellAllVar);
        li.appendChild(left); li.appendChild(right); inventoryEl.appendChild(li);
      });
    });
  }

  // Sell a single item of a specific variant
  function sellOneVariant(id, variant){ const items = Array.isArray(inventory[id]) ? inventory[id] : []; if(!items || items.length===0) return; const plant = PLANTS[id]; const idx = items.indexOf(variant); if(idx === -1) return; items.splice(idx,1); inventory[id] = items; const mul = (plant.variants && plant.variants[variant] && plant.variants[variant].mul) ? plant.variants[variant].mul : 1; const gained = Math.round((plant.price || 1) * mul); money += gained; saveJSON(INV_KEY, inventory); saveNumber(MONEY_KEY, money); updateMoney(); renderInventory(); }

  // Sell all items of a specific variant
  function sellAllVariant(id, variant){ const items = Array.isArray(inventory[id]) ? inventory[id] : []; if(!items || items.length===0) return; const plant = PLANTS[id]; let total = 0; const remaining = []; items.forEach(v=>{ if(v === variant){ const mul = (plant.variants && plant.variants[v] && plant.variants[v].mul) ? plant.variants[v].mul : 1; total += (plant.price || 1) * mul; } else { remaining.push(v); } }); const gained = Math.round(total); money += gained; inventory[id] = remaining; saveJSON(INV_KEY, inventory); saveNumber(MONEY_KEY, money); updateMoney(); renderInventory(); }

  function renderMarket(){
    if(!marketEl) return;
    marketEl.innerHTML = '';
    const header = document.createElement('div'); header.className = 'market-header'; header.textContent = 'Below are the variant chances for each crop and how each variant changes its sell value.';
    marketEl.appendChild(header);
    Object.keys(PLANTS).forEach(id=>{
      const p = PLANTS[id];
      const container = document.createElement('div'); container.className = 'market-row';
      const title = document.createElement('div'); title.className = 'market-title'; title.textContent = `${p.name} — Base Price: ${fmt(p.price)}`;
      container.appendChild(title);

      const ul = document.createElement('ul'); ul.className = 'variant-list';
      // compute explicit odds (normal is remainder)
      const odds = p.variantOdds || {};
      const diamondOdds = odds.diamond || 0;
      const goldOdds = odds.gold || 0;
      const silverOdds = odds.silver || 0;
      const normalOdds = Math.max(0, 1 - (diamondOdds + goldOdds + silverOdds));
      const order = ['normal','silver','gold','diamond'];
      order.forEach(v => {
        const mul = (p.variants && p.variants[v] && p.variants[v].mul) ? p.variants[v].mul : 1;
        let chance = 0;
        if(v === 'diamond') chance = diamondOdds;
        else if(v === 'gold') chance = goldOdds;
        else if(v === 'silver') chance = silverOdds;
        else chance = normalOdds;
        const li = document.createElement('li');
        const pct = Math.round(chance * 10000) / 100; // percentage with 2 decimals
        const value = Math.round((p.price || 1) * mul);
        // badge
        const badge = document.createElement('span'); badge.className = `variant-badge ${v}`;
        // main text
        const txt = document.createElement('span'); txt.className = 'variant-text';
  txt.textContent = `${v} — ${pct}% Chance — x${mul} Value`;
        li.appendChild(badge);
        li.appendChild(txt);
        ul.appendChild(li);
      });
      container.appendChild(ul);
      marketEl.appendChild(container);
    });
  }

  // Farmers UI (unchanged behavior)
  function renderFarmersList(){ const list = $('farmers-list'); if(!list) return; list.innerHTML = ''; if(!farmers || farmers.length===0){ const p = document.createElement('div'); p.className='muted'; p.textContent = 'No farmers hired'; list.appendChild(p); } else {
      farmers.forEach(f=>{
        const row = document.createElement('div'); row.className = 'farmer-row';
        const left = document.createElement('div'); left.textContent = `Farmer #${f.id} — ${f.assignedPlot!==null? 'Plot ' + (f.assignedPlot+1) : 'Unassigned'}`;
        const right = document.createElement('div');
        const sel = document.createElement('select'); sel.title = 'Auto-replant'; const offOpt = document.createElement('option'); offOpt.value = ''; offOpt.textContent = 'Auto: Off'; sel.appendChild(offOpt);
        Object.keys(PLANTS).forEach(pid=>{ const opt = document.createElement('option'); opt.value = pid; opt.textContent = `${PLANTS[pid].name}${PLANTS[pid].seedCost? ' — ' + fmt(PLANTS[pid].seedCost) : ''}`; sel.appendChild(opt); });
        sel.value = f.autoReplant || '';
        sel.addEventListener('change', ()=>{ f.autoReplant = sel.value || null; saveJSON(FARMERS_KEY, farmers); renderFarmersList(); });
        const assignBtn = document.createElement('button'); assignBtn.textContent = f.assignedPlot===null ? 'Assign' : 'Reassign'; assignBtn.addEventListener('click', ()=>{ assigningFarmerId = f.id; if(plotsContainer) plotsContainer.classList.add('assigning'); });
        const unassignBtn = document.createElement('button'); unassignBtn.textContent = 'Unassign'; unassignBtn.style.marginLeft='6px'; unassignBtn.addEventListener('click', ()=>{ const ff = farmers.find(x=>x.id===f.id); if(ff){ ff.assignedPlot = null; saveJSON(FARMERS_KEY,farmers); renderFarmersList(); renderPlots(); } });
        const fireBtn = document.createElement('button'); fireBtn.textContent='Fire'; fireBtn.style.marginLeft='6px'; fireBtn.addEventListener('click', ()=>{ if(!confirm('Fire this farmer?')) return; farmers = farmers.filter(x=>x.id !== f.id); if(assigningFarmerId === f.id) assigningFarmerId = null; for(let i=0;i<farmers.length;i++){ farmers[i].id = i+1; } farmerCounter = farmers.length; saveNumber(FARMER_COUNTER_KEY, farmerCounter); saveJSON(FARMERS_KEY,farmers); renderFarmersList(); renderPlots(); });
        right.appendChild(sel); right.appendChild(assignBtn); right.appendChild(unassignBtn); right.appendChild(fireBtn);
        row.appendChild(left); row.appendChild(right); list.appendChild(row);
      });
    }
    const hireWrap = document.createElement('div'); hireWrap.style.marginTop='10px'; const hireBtn = document.createElement('button'); hireBtn.textContent = `Hire Farmer — ${fmt(FARMER_COST)}`; hireBtn.disabled = money < FARMER_COST; hireBtn.addEventListener('click', ()=>{ if(money < FARMER_COST) return; if(!confirm(`Hire farmer for ${fmt(FARMER_COST)}?`)) return; money -= FARMER_COST; farmerCounter = (Number.isFinite(farmerCounter) ? farmerCounter : 0) + 1; const newFarmer = { id: farmerCounter, assignedPlot: null, autoReplant: null }; farmers.push(newFarmer); saveNumber(MONEY_KEY, money); saveJSON(FARMERS_KEY, farmers); saveNumber(FARMER_COUNTER_KEY, farmerCounter); updateMoney(); renderFarmersList(); }); hireWrap.appendChild(hireBtn); list.appendChild(hireWrap);
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
    const seedIcon = document.createElement('div'); seedIcon.className = 'seed-icon'; seedIcon.innerHTML = getPlantSVG('empty','idle');
    const progress = document.createElement('div'); progress.className = 'progress';
    const bar = document.createElement('div'); bar.className = 'bar'; bar.style.width = '0%'; progress.appendChild(bar);
    inner.appendChild(seedIcon); inner.appendChild(progress); wrapper.appendChild(inner);
    const label = document.createElement('div'); label.className = 'plot-label'; label.innerHTML = `Plot ${idx+1}<br><small class="plot-state">Empty</small>`;
    const stateEl = label.querySelector('.plot-state');
    const farmerBadge = document.createElement('div'); farmerBadge.className = 'farmer-badge'; farmerBadge.style.display = 'none'; farmerBadge.title = 'Assigned farmer'; farmerBadge.textContent = '👩‍🌾'; inner.appendChild(farmerBadge);

    function refresh(){
      const p = plots[idx];
      if(!p){ wrapper.classList.remove('planted'); stateEl.textContent = 'Empty'; wrapper.setAttribute('aria-label','Empty plot. Drag a seed here to plant'); bar.style.width='0%'; seedIcon.innerHTML = getPlantSVG('empty','idle');
      } else {
        const plant = PLANTS[p.plantId];
        const elapsed = Math.max(0, Math.floor((Date.now() - p.plantedAt)/1000));
        const pct = Math.min(100, Math.round((elapsed / plant.grow) * 100));
        bar.style.width = pct + '%';
        if(elapsed >= plant.grow){ stateEl.textContent = `${plant.name} — Ready`; seedIcon.innerHTML = getPlantSVG(p.plantId,'harvest'); wrapper.setAttribute('aria-label', `${plant.name} ready to harvest. Click to harvest`); }
        else { stateEl.textContent = `${plant.name} — Growing (${elapsed}s / ${plant.grow}s)`; seedIcon.innerHTML = getPlantSVG(p.plantId,'growing'); wrapper.setAttribute('aria-label', `${plant.name} growing`); }
        wrapper.classList.add('planted');
      }
      try{ const assigned = farmers && farmers.find && farmers.find(f=>f.assignedPlot === idx); if(assigned){ farmerBadge.style.display = 'block'; farmerBadge.title = `Farmer #${assigned.id} assigned to this plot`; } else { farmerBadge.style.display = 'none'; } }catch(e){ farmerBadge.style.display = 'none'; }
    }

    wrapper.addEventListener('click', ()=>{
      if(assigningFarmerId !== null){ const farmer = farmers.find(f=>f.id === assigningFarmerId); if(farmer){ const already = farmers.find(f=>f.assignedPlot === idx && f.id !== farmer.id); if(already){ const prev = document.title; document.title = 'Plot already has a farmer'; setTimeout(()=>document.title = prev, 800); } else { farmer.assignedPlot = idx; saveJSON(FARMERS_KEY, farmers); renderFarmersList(); renderPlots(); } } assigningFarmerId = null; if(plotsContainer) plotsContainer.classList.remove('assigning'); return; }
      const p = plots[idx]; if(!p) return; const plant = PLANTS[p.plantId]; const elapsed = Math.floor((Date.now()-p.plantedAt)/1000); if(elapsed>=plant.grow){ harvest(idx); }
    });
    wrapper.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); wrapper.click(); } });
    wrapper.addEventListener('dragover', (e)=>{ e.preventDefault(); e.dataTransfer.dropEffect='copy'; wrapper.classList.add('drag-over'); });
    wrapper.addEventListener('dragleave', ()=>{ wrapper.classList.remove('drag-over'); });
    wrapper.addEventListener('drop', (e)=>{ e.preventDefault(); wrapper.classList.remove('drag-over'); const pid = e.dataTransfer.getData('text/plain'); if(pid && PLANTS[pid] && !plots[idx]){ plantCrop(pid, idx); } });
    wrapper._refresh = refresh; return {el: wrapper, labelEl: label, refresh};
  }

  function renderPlots(){ if(!plotsContainer) return; if(isDragging){ const existingPlots = plotsContainer.querySelectorAll('.plot'); existingPlots.forEach(pel=>{ try{ if(typeof pel._refresh === 'function') pel._refresh(); }catch(e){} }); const containers = plotsContainer.children; for(let i=0;i<plots.length && i<containers.length;i++){ try{ const label = containers[i].querySelector('.plot-label'); if(label){ const stateText = plots[i] ? (PLANTS[plots[i].plantId] && PLANTS[plots[i].plantId].name ? PLANTS[plots[i].plantId].name : 'Growing') : 'Empty'; label.innerHTML = `Plot ${i+1}<br><small class="plot-state">${stateText}</small>`; } }catch(e){} } return; }
    plotsContainer.innerHTML = ''; const elements = []; plots.forEach((p, idx)=>{ const {el,labelEl,refresh} = createPlotElement(idx,p); const container = document.createElement('div'); container.style.textAlign='center'; container.appendChild(el); container.appendChild(labelEl); plotsContainer.appendChild(container); elements.push({el,refresh}); }); elements.forEach(x=>x.refresh()); }

  function plantCrop(plantId, idx){ if(plots[idx]) return; const plant = PLANTS[plantId]; if(!plant) return; const cost = Number(plant.seedCost || 0); if(cost > 0){ if(money < cost){ const prev = document.title; document.title = 'Not enough money'; setTimeout(()=>document.title = prev, 800); return; } money -= cost; saveNumber(MONEY_KEY, money); updateMoney(); } plots[idx] = { plantId, plantedAt: Date.now() }; saveJSON(PLOTS_KEY, plots); renderPlots(); }

  function harvest(idx){ if(!plots[idx]) return; const plant = PLANTS[plots[idx].plantId]; const elapsed = Math.floor((Date.now()-plots[idx].plantedAt)/1000); if(elapsed < plant.grow) return; const pid = plots[idx].plantId; const variant = sampleVariantFor(pid); inventory[pid] = Array.isArray(inventory[pid]) ? inventory[pid] : []; inventory[pid].push(variant); plots[idx] = null; saveJSON(INV_KEY, inventory); saveJSON(PLOTS_KEY, plots); renderPlots(); renderInventory(); }

  function sellOne(id){ const items = Array.isArray(inventory[id]) ? inventory[id] : []; if(!items || items.length === 0) return; const plant = PLANTS[id]; // pick highest multiplier variant available
    let bestIdx = 0; let bestMul = 0; for(let i=0;i<items.length;i++){ const v = items[i]; const mul = (plant.variants && plant.variants[v] && plant.variants[v].mul) ? plant.variants[v].mul : 1; if(mul > bestMul){ bestMul = mul; bestIdx = i; } }
    const variant = items.splice(bestIdx,1)[0]; inventory[id] = items; const gained = Math.round((plant.price || 1) * ((plant.variants && plant.variants[variant] && plant.variants[variant].mul) || 1)); money += gained; saveJSON(INV_KEY, inventory); saveNumber(MONEY_KEY, money); updateMoney(); renderInventory(); }

  function sellAll(id){ const items = Array.isArray(inventory[id]) ? inventory[id] : []; if(!items || items.length === 0) return; const plant = PLANTS[id]; let total = 0; items.forEach(v=>{ const mul = (plant.variants && plant.variants[v] && plant.variants[v].mul) ? plant.variants[v].mul : 1; total += (plant.price || 1) * mul; }); const gained = Math.round(total); money += gained; inventory[id] = []; saveJSON(INV_KEY, inventory); saveNumber(MONEY_KEY, money); updateMoney(); renderInventory(); }

  function updateBuyPlotButton(){ if(!buyPlotBtn) return; const cost = nextPlotCost(); buyPlotBtn.textContent = `Buy Plot — ${fmt(cost)}`; buyPlotBtn.disabled = money < cost; }

  function buyPlot(){ const cost = nextPlotCost(); if(money < cost) return; money -= cost; plots.push(null); saveNumber(MONEY_KEY,money); saveJSON(PLOTS_KEY,plots); updateMoney(); renderPlots(); }

  function resetGame(){ if(!confirm('Reset game? This clears money, inventory and plots.')) return; money = 0; plots = [null]; inventory = {}; farmName = 'Tiny Farm'; saveAll(); renderPlots(); renderInventory(); renderFarmName(); updateMoney(); }

  let ticker = null; function tick(){ try{ if(farmers && farmers.length){ farmers.forEach(f=>{ const idx = f.assignedPlot; if(typeof idx === 'number' && !isNaN(idx) && plots[idx]){ const plant = PLANTS[plots[idx].plantId]; if(plant){ const elapsed = Math.floor((Date.now()-plots[idx].plantedAt)/1000); if(elapsed >= plant.grow){ harvest(idx); try{ if(f.autoReplant){ plantCrop(f.autoReplant, idx); } }catch(e){} } } } }); } }catch(e){} renderPlots(); }
  function startTicker(){ if(ticker) return; ticker = setInterval(tick, 1000); }
  function stopTicker(){ if(ticker){ clearInterval(ticker); ticker=null; } }

  function setupSeedTray(){ if(!seedTray) return; seedTray.querySelectorAll('[data-plant]').forEach(el=>{ el.addEventListener('dragstart', (e)=>{ e.dataTransfer.setData('text/plain', el.dataset.plant); e.dataTransfer.effectAllowed='copy'; }); el.addEventListener('click', ()=>{ seedTray.querySelectorAll('.seed').forEach(s=>s.classList.remove('selected')); el.classList.add('selected'); const handler = function(ev){ const target = ev.target; const plotEl = target.closest ? target.closest('.plot') : null; if(!plotEl) return; const idx = parseInt(plotEl.dataset.index,10); if(!isNaN(idx) && !plots[idx]){ plantCrop(el.dataset.plant, idx); el.classList.remove('selected'); try{ plotsContainer.removeEventListener('click', handler); }catch(e){} } }; if(plotsContainer){ plotsContainer.addEventListener('click', handler); setTimeout(()=>{ el.classList.remove('selected'); try{ plotsContainer.removeEventListener('click', handler); }catch(e){} }, 8000); } }); }); }

  function init(){ renderFarmName(); renderInventory(); renderMarket(); renderPlots(); updateMoney(); setupSeedTray(); startTicker(); if(buyPlotBtn) buyPlotBtn.addEventListener('click', buyPlot); if(resetBtn) resetBtn.addEventListener('click', resetGame);
    const farmersBtn = $('farmers-btn'); const farmersClose = $('farmers-close'); if(farmersBtn) farmersBtn.addEventListener('click', ()=>{ const panel = $('farmers-panel'); if(panel){ panel.hidden = !panel.hidden; if(!panel.hidden) renderFarmersList(); } }); if(farmersClose) farmersClose.addEventListener('click', ()=>{ closeFarmersPanel(); }); if(editNameBtn) editNameBtn.addEventListener('click', ()=>{ const v = prompt('Enter farm name', farmName); if(v!==null){ const s=v.trim(); if(s.length){ farmName = s; saveString(FARM_NAME_KEY, farmName); renderFarmName(); } } }); if(farmNameEl) farmNameEl.addEventListener('dblclick', ()=>{ const v = prompt('Enter farm name', farmName); if(v!==null){ const s=v.trim(); if(s.length){ farmName = s; saveString(FARM_NAME_KEY, farmName); renderFarmName(); } } }); updateBuyPlotButton();

    const adminBtn = $('admin-btn'); const adminModal = document.getElementById('admin-modal'); const adminAmount = document.getElementById('admin-amount'); const adminGive = document.getElementById('admin-give-btn'); const adminClose = document.getElementById('admin-close-btn');
    if(adminBtn){ adminBtn.addEventListener('click', ()=>{ if(adminModal) adminModal.hidden = false; const pass = document.getElementById('admin-passcode'); const controls = document.getElementById('admin-controls'); if(controls) controls.hidden = true; if(pass){ pass.value=''; setTimeout(()=>pass.focus(),60); } }); }
    if(adminClose){ adminClose.addEventListener('click', ()=>{ if(adminModal) adminModal.hidden = true; }); }
    const adminUnlock = document.getElementById('admin-unlock-btn'); if(adminUnlock){ adminUnlock.addEventListener('click', ()=>{ const pass = document.getElementById('admin-passcode'); const controls = document.getElementById('admin-controls'); if(pass && controls){ if(pass.value === '2005'){ controls.hidden = false; const amountEl = document.getElementById('admin-amount'); if(amountEl) setTimeout(()=>amountEl.focus(),60); } else { try{ const prev = document.title; document.title = 'Wrong passcode'; setTimeout(()=>document.title = prev, 900); }catch(e){} } } }); }
    if(adminGive){ adminGive.addEventListener('click', ()=>{ if(!adminAmount) return; const n = Number(adminAmount.value); if(!Number.isFinite(n) || n <= 0) return; money += Math.round(n); saveNumber(MONEY_KEY, money); updateMoney(); if(adminModal) adminModal.hidden = true; }); }
    window.addEventListener('beforeunload', saveAll);

    document.addEventListener('dragover', function(e){ e.preventDefault(); });
    document.addEventListener('dragstart', function(){ isDragging = true; }, true);
    document.addEventListener('dragend', function(){ isDragging = false; }, true);
    document.addEventListener('drop', function(e){ try{ const pid = e.dataTransfer.getData('text/plain'); if(!pid) return; const el = document.elementFromPoint(e.clientX, e.clientY); const plotEl = el && el.closest ? el.closest('.plot') : null; if(plotEl){ const idx = parseInt(plotEl.dataset.index,10); if(!isNaN(idx) && !plots[idx]){ plantCrop(pid, idx); } } isDragging = false; }catch(err){} });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  })();

