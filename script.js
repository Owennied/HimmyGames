(function(){
	// Simple clicker: each click = $1. Value persisted to localStorage.
	const STORAGE_KEY = 'himmy_clicker_money_v1';

	function $(id){ return document.getElementById(id); }

	const moneyEl = $('money');
	const earnBtn = $('earn-btn');
	const resetBtn = $('reset-btn');

	function load(){
		const raw = localStorage.getItem(STORAGE_KEY);
		const n = parseInt(raw, 10);
		return Number.isFinite(n) ? n : 0;
	}

	function save(v){ localStorage.setItem(STORAGE_KEY, String(v)); }

	function format(v){ return '$' + v.toLocaleString(); }

	let money = load();

	function updateDisplay(){
		if(moneyEl) moneyEl.textContent = format(money);
	}

	if(earnBtn){
		earnBtn.addEventListener('click', function(){
			money = (money || 0) + 1;
			save(money);
			updateDisplay();
			earnBtn.classList.add('pop');
			setTimeout(()=>earnBtn.classList.remove('pop'),120);
		});
	}

	if(resetBtn){
		resetBtn.addEventListener('click', function(){
			if(!confirm('Reset your money to $0?')) return;
			money = 0;
			save(money);
			updateDisplay();
		});
	}

	// Initialize when DOM is ready
	if(document.readyState === 'loading'){
		document.addEventListener('DOMContentLoaded', updateDisplay);
	} else {
		updateDisplay();
	}

	// Optional: keyboard shortcut (Space) to earn
	document.addEventListener('keydown', function(e){
		if(e.code === 'Space' && document.activeElement.tagName !== 'INPUT'){
			e.preventDefault();
			if(earnBtn) earnBtn.click();
		}
	});
})();

