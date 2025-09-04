// Warframe Market Tracker - JavaScript Functionality

class WarframeMarketAPI {
    constructor() {
        // Use CORS proxy for web browsers, direct API for Electron
        this.isElectron = window.electronAPI !== undefined;
        this.baseURL = this.isElectron 
            ? 'https://api.warframe.market/v1'
            : 'https://corsproxy.io/?https://api.warframe.market/v1';
        this.cache = new Map();
        this.cacheTimeout = 300000; // 5 minutes
    }

    async fetchWithCache(url) {
        const now = Date.now();
        const cached = this.cache.get(url);
        
        if (cached && (now - cached.timestamp) < this.cacheTimeout) {
            return cached.data;
        }

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Warframe Market Tracker/1.0.0'
                },
                mode: 'cors'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            this.cache.set(url, { data, timestamp: now });
            return data;
        } catch (error) {
            console.error('API Error:', error);
            console.error('Failed URL:', url);
            
            // Return cached data if available, even if expired
            if (cached) {
                console.log('Using expired cache due to fetch error');
                return cached.data;
            }
            
            throw error;
        }
    }

    async getItems() {
        const url = `${this.baseURL}/items`;
        return await this.fetchWithCache(url);
    }

    async getItemOrders(itemUrlName) {
        const url = `${this.baseURL}/items/${itemUrlName}/orders`;
        return await this.fetchWithCache(url);
    }

    async searchItems(query) {
        try {
            const response = await this.getItems();
            const items = response.payload.items;
            
            const filtered = items.filter(item => 
                item.item_name.toLowerCase().includes(query.toLowerCase()) ||
                item.url_name.toLowerCase().includes(query.toLowerCase())
            ).slice(0, 10);
            
            return filtered;
        } catch (error) {
            console.error('Search error:', error);
            return [];
        }
    }
}

class WarframeAlertsAPI {
    constructor() {
        this.baseURL = 'https://api.warframestat.us/pc';
        this.cache = new Map();
        this.cacheTimeout = 60000; // 1 minute for alerts data
    }

    async fetchWithCache(url) {
        const now = Date.now();
        const cached = this.cache.get(url);
        
        if (cached && (now - cached.timestamp) < this.cacheTimeout) {
            console.log('Using cached data');
            return cached.data;
        }

        console.log('Fetching fresh data from:', url);
        
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            console.log('Response status:', response.status);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('API response received, caching...');
            this.cache.set(url, { data, timestamp: now });
            return data;
        } catch (error) {
            console.error('Alerts API Error details:', error);
            throw new Error(`Failed to fetch alerts data: ${error.message}`);
        }
    }

    async getWorldState() {
        return await this.fetchWithCache(this.baseURL);
    }
}

class WarframeMarketApp {
    constructor() {
        this.api = new WarframeMarketAPI();
        this.alertsAPI = new WarframeAlertsAPI();
        this.currentItem = null;
        this.currentOrders = null;
        this.orderFilter = 'all'; // 'all', 'buy', 'sell'
        this.recentSearches = JSON.parse(localStorage.getItem('recentSearches') || '[]');
        this.alertsRefreshInterval = null;
        this.timerUpdateInterval = null;
        this.currentMainTab = 'market';
        this.cycleTimers = new Map(); // Store timer data for real-time updates
        this.alertTimers = new Map(); // Store alert timer data for real-time updates
        this.fissureTimers = new Map(); // Store fissure timer data for real-time updates
        this.pendingRefresh = false; // Prevent multiple simultaneous refreshes
        
        // Common Warframe node mappings for better location display
        this.nodeMap = new Map([
            // Earth
            ['SolNode1', 'Coba (Earth)'],
            ['SolNode2', 'Mantle (Earth)'],
            ['SolNode3', 'Mariana (Earth)'],
            ['SolNode4', 'Pacific (Earth)'],
            ['SolNode5', 'Cambria (Earth)'],
            ['SolNode6', 'Lua (Earth)'],
            // Venus
            ['SolNode51', 'Venera (Venus)'],
            ['SolNode52', 'Aphrodite (Venus)'],
            ['SolNode53', 'Cytherean (Venus)'],
            ['SolNode54', 'Tessera (Venus)'],
            ['SolNode55', 'Linea (Venus)'],
            // Mercury  
            ['SolNode101', 'Caloris (Mercury)'],
            ['SolNode102', 'Tolstoj (Mercury)'],
            ['SolNode103', 'Beethoven (Mercury)'],
            // Mars
            ['SolNode201', 'Olympia (Mars)'],
            ['SolNode202', 'Phobos (Mars)'],
            ['SolNode203', 'Deimos (Mars)'],
            ['SolNode204', 'Tharsis (Mars)'],
            ['SolNode205', 'Hellas (Mars)'],
            // Common ones that often appear in alerts
            ['SolNode401', 'Ceres Station'],
            ['SolNode451', 'Europa Station'],
            ['SolNode501', 'Jupiter Station'],
            ['SolNode551', 'Saturn Station'],
            ['SolNode601', 'Uranus Station'],
            ['SolNode651', 'Neptune Station'],
            ['SolNode701', 'Pluto Station'],
            ['SolNode801', 'Sedna Station'],
            ['SolNode851', 'Eris Station'],
            ['SolNode901', 'Void Station']
        ]);
        
        this.initializeElements();
        this.bindEvents();
        this.loadRecentSearches();
        this.hideResults();
        
        // Initialize header text for default tab
        this.updateHeaderText(this.currentMainTab);
    }

    initializeElements() {
        // Main tab elements
        this.mainTabBtns = document.querySelectorAll('.main-tab-btn');
        this.mainTabPanels = document.querySelectorAll('.main-tab-panel');
        
        // Market tab elements
        this.searchInput = document.getElementById('itemSearch');
        this.searchBtn = document.getElementById('searchBtn');
        this.suggestionsContainer = document.getElementById('suggestions');
        this.recentList = document.getElementById('recentList');
        
        this.loadingContainer = document.getElementById('loadingContainer');
        this.resultsContainer = document.getElementById('resultsContainer');
        this.errorContainer = document.getElementById('errorContainer');
        this.welcomeMessage = document.getElementById('welcomeMessage');
        
        this.itemNameEl = document.getElementById('itemName');
        this.tabBtns = document.querySelectorAll('.tab-btn');
        this.tabPanels = document.querySelectorAll('.tab-panel');
        
        // Pricing elements
        this.highestBuyEl = document.getElementById('highestBuy');
        this.lowestSellEl = document.getElementById('lowestSell');
        this.buyOrdersList = document.getElementById('buyOrdersList');
        this.sellOrdersList = document.getElementById('sellOrdersList');
        
        // Statistics elements
        this.totalOrdersEl = document.getElementById('totalOrders');
        this.priceRangeEl = document.getElementById('priceRange');
        this.averagePriceEl = document.getElementById('averagePrice');
        this.onlineSellersEl = document.getElementById('onlineSellers');
        this.onlineBuyersEl = document.getElementById('onlineBuyers');
        this.lastUpdatedEl = document.getElementById('lastUpdated');
        
        this.retryBtn = document.getElementById('retryBtn');
        this.orderFilterBtn = document.getElementById('orderFilterBtn');
        
        // Alerts tab elements
        this.cyclesContainer = document.getElementById('cyclesContainer');
        this.alertsContainer = document.getElementById('alertsContainer');
        this.activitiesContainer = document.getElementById('activitiesContainer');
        this.alertsLoading = document.getElementById('alertsLoading');
        this.refreshAlertsBtn = document.getElementById('refreshAlertsBtn');
    }

    bindEvents() {
        // Main tab events
        this.mainTabBtns.forEach(btn => {
            btn.addEventListener('click', this.handleMainTabClick.bind(this));
        });
        
        // Market tab events
        if (this.searchInput) {
            this.searchInput.addEventListener('input', this.handleSearchInput.bind(this));
            this.searchInput.addEventListener('keydown', this.handleSearchKeydown.bind(this));
        }
        if (this.searchBtn) {
            this.searchBtn.addEventListener('click', this.handleSearch.bind(this));
        }
        
        this.tabBtns.forEach(btn => {
            btn.addEventListener('click', this.handleTabClick.bind(this));
        });
        
        this.retryBtn.addEventListener('click', this.handleRetry.bind(this));
        this.orderFilterBtn.addEventListener('click', this.handleFilterToggle.bind(this));
        
        // Alerts tab events
        if (this.refreshAlertsBtn) {
            this.refreshAlertsBtn.addEventListener('click', () => {
                console.log('Manual refresh clicked');
                this.loadAlertsData();
            });
        }
        
        // Hide suggestions when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.searchInput.contains(e.target) && !this.suggestionsContainer.contains(e.target)) {
                this.hideSuggestions();
            }
        });
    }

    async handleSearchInput(e) {
        const query = e.target.value.trim();
        
        if (query.length < 2) {
            this.hideSuggestions();
            return;
        }

        try {
            const items = await this.api.searchItems(query);
            this.showSuggestions(items);
        } catch (error) {
            console.error('Search input error:', error);
            console.warn('Auto-suggestions temporarily unavailable');
            this.hideSuggestions();
            
            // Show a subtle warning to user if this is the first failure
            if (!this.searchWarningShown) {
                this.searchWarningShown = true;
                setTimeout(() => {
                    if (this.searchInput.value.trim() === query) {
                        this.showInfo('Auto-suggestions may be limited. Try typing the full item name.');
                    }
                }, 1000);
            }
        }
    }

    handleSearchKeydown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            this.handleSearch();
        }
    }

    async handleSearch() {
        const query = this.searchInput.value.trim();
        
        if (!query) {
            this.showError('Please enter an item name');
            return;
        }

        try {
            console.log('Starting search for:', query);
            this.showLoading();
            
            const items = await this.api.searchItems(query);
            console.log('Search results:', items);
            
            if (items.length === 0) {
                this.showError('No items found matching your search');
                return;
            }

            // Use exact match if found, otherwise use first result
            const exactMatch = items.find(item => 
                item.item_name.toLowerCase() === query.toLowerCase() ||
                item.url_name.toLowerCase() === query.toLowerCase()
            );
            
            const selectedItem = exactMatch || items[0];
            console.log('Selected item:', selectedItem);
            await this.loadItemData(selectedItem);
            this.hideSuggestions();
            
        } catch (error) {
            console.error('Search error:', error);
            console.error('Error details:', error.message);
            this.showError(`Connection failed: ${error.message}. Check console for details.`);
        }
    }

    handleFilterToggle() {
        // Cycle through: all -> sell -> buy -> all
        const filters = ['all', 'sell', 'buy'];
        const currentIndex = filters.indexOf(this.orderFilter);
        const nextIndex = (currentIndex + 1) % filters.length;
        this.orderFilter = filters[nextIndex];
        
        this.updateFilterButton();
        
        // Refresh display if we have current orders
        if (this.currentOrders) {
            this.displayOrders(this.currentOrders, null);
        }
    }

    updateFilterButton() {
        const btn = this.orderFilterBtn;
        
        // Remove all filter classes
        btn.classList.remove('sell-only', 'buy-only');
        
        switch (this.orderFilter) {
            case 'all':
                btn.textContent = 'All Orders';
                btn.dataset.filter = 'all';
                break;
            case 'sell':
                btn.textContent = 'Sell Orders';
                btn.classList.add('sell-only');
                btn.dataset.filter = 'sell';
                break;
            case 'buy':
                btn.textContent = 'Buy Orders';
                btn.classList.add('buy-only');
                btn.dataset.filter = 'buy';
                break;
        }
    }

    async handleRetry() {
        if (this.currentItem) {
            await this.loadItemData(this.currentItem);
        } else {
            this.handleSearch();
        }
    }

    handleTabClick(e) {
        const tabName = e.target.dataset.tab;
        this.switchTab(tabName);
    }

    switchTab(tabName) {
        this.tabBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        
        this.tabPanels.forEach(panel => {
            panel.classList.toggle('active', panel.id === `${tabName}Tab`);
        });
    }

    handleMainTabClick(e) {
        const tabName = e.target.dataset.mainTab;
        this.switchMainTab(tabName);
    }

    switchMainTab(tabName) {
        this.currentMainTab = tabName;
        
        this.mainTabBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mainTab === tabName);
        });
        
        this.mainTabPanels.forEach(panel => {
            panel.classList.toggle('active', panel.id === `${tabName}Tab`);
        });
        
        // Update header text based on active tab
        this.updateHeaderText(tabName);
        
        // Load alerts data when switching to alerts tab
        if (tabName === 'alerts') {
            this.loadAlertsData();
            this.startAlertsRefresh();
            this.startTimerUpdates(); // Start real-time timer updates
        } else {
            this.stopAlertsRefresh();
            this.stopTimerUpdates(); // Stop timer updates when not on alerts tab
        }
    }

    updateHeaderText(tabName) {
        const titleAccent = document.querySelector('.title-accent');
        const titleMain = document.querySelector('.title-main');
        
        if (titleAccent && titleMain) {
            if (tabName === 'alerts') {
                titleAccent.textContent = 'WARFRAME';
                titleMain.textContent = 'ALERTS';
                document.title = 'Warframe Alerts';
            } else {
                titleAccent.textContent = 'WARFRAME';
                titleMain.textContent = 'MARKET TRACKER';
                document.title = 'Warframe Market Tracker';
            }
        }
    }

    showSuggestions(items) {
        if (items.length === 0) {
            this.hideSuggestions();
            return;
        }

        this.suggestionsContainer.innerHTML = items.map(item => `
            <div class="suggestion-item" data-url-name="${item.url_name}" data-item-name="${item.item_name}">
                ${item.item_name}
            </div>
        `).join('');

        // Bind click events to suggestions
        this.suggestionsContainer.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                const urlName = e.target.dataset.urlName;
                const itemName = e.target.dataset.itemName;
                
                this.searchInput.value = itemName;
                this.hideSuggestions();
                
                await this.loadItemData({ url_name: urlName, item_name: itemName });
            });
        });

        this.suggestionsContainer.classList.add('show');
    }

    hideSuggestions() {
        this.suggestionsContainer.classList.remove('show');
        this.suggestionsContainer.innerHTML = '';
    }

    async loadItemData(item) {
        this.currentItem = item;
        this.showLoading();
        
        try {
            const response = await this.api.getItemOrders(item.url_name);
            const orders = response.payload.orders;
            
            this.displayItemData(item, orders);
            this.addToRecentSearches(item);
            this.showResults();
            
        } catch (error) {
            console.error('Load item error:', error);
            this.showError(`Failed to load data for ${item.item_name}`);
        }
    }

    displayItemData(item, orders) {
        this.itemNameEl.textContent = item.item_name;
        this.currentOrders = orders; // Store for filtering
        
        const buyOrders = orders.filter(order => order.order_type === 'buy').sort((a, b) => b.platinum - a.platinum);
        const sellOrders = orders.filter(order => order.order_type === 'sell').sort((a, b) => a.platinum - b.platinum);
        
        // Update pricing summary
        this.highestBuyEl.textContent = buyOrders.length > 0 ? `${buyOrders[0].platinum} ♦` : '-- ♦';
        this.lowestSellEl.textContent = sellOrders.length > 0 ? `${sellOrders[0].platinum} ♦` : '-- ♦';
        
        // Display orders in new table format
        this.displayOrders(orders, null);
        
        // Update statistics
        this.updateStatistics(buyOrders, sellOrders, orders);
    }

    displayOrders(orders, container) {
        // Update for new table structure
        const tableBody = document.getElementById('ordersTableBody');
        const totalOrdersQuick = document.getElementById('totalOrdersQuick');
        
        if (!tableBody) {
            console.error('Table body not found');
            return;
        }

        if (orders.length === 0) {
            tableBody.innerHTML = '<div class="no-orders" style="padding: 20px; text-align: center; color: #9ca3af;">No orders available</div>';
            if (totalOrdersQuick) totalOrdersQuick.textContent = '0';
            return;
        }

        // Filter for online users only and apply current filter
        let filteredOrders = orders.filter(order => 
            order.user.status === 'ingame' || order.user.status === 'online'
        );
        
        // Apply order type filter
        if (this.orderFilter === 'buy') {
            filteredOrders = filteredOrders.filter(order => order.order_type === 'buy');
        } else if (this.orderFilter === 'sell') {
            filteredOrders = filteredOrders.filter(order => order.order_type === 'sell');
        }
        
        const onlineOrders = filteredOrders;
        
        // Sort function that prioritizes: 1. In-game users, 2. Online users, 3. Best prices
        const sortWithPriority = (a, b, isAscending = true) => {
            // Priority: ingame > online
            const statusPriority = { ingame: 3, online: 2, offline: 1 };
            const aPriority = statusPriority[a.user.status] || 0;
            const bPriority = statusPriority[b.user.status] || 0;
            
            if (aPriority !== bPriority) {
                return bPriority - aPriority; // Higher priority first
            }
            
            // If same status, sort by price
            return isAscending ? a.platinum - b.platinum : b.platinum - a.platinum;
        };
        
        const buyOrders = onlineOrders
            .filter(order => order.order_type === 'buy')
            .sort((a, b) => sortWithPriority(a, b, false)); // Descending price for buy orders
            
        const sellOrders = onlineOrders
            .filter(order => order.order_type === 'sell')
            .sort((a, b) => sortWithPriority(a, b, true)); // Ascending price for sell orders
        
        const allOrdersSorted = [...sellOrders.slice(0, 10), ...buyOrders.slice(0, 10)];

        if (totalOrdersQuick) totalOrdersQuick.textContent = onlineOrders.length.toString();

        tableBody.innerHTML = allOrdersSorted.map(order => `
            <div class="table-row">
                <div class="table-cell">${order.user.ingame_name}</div>
                <div class="table-cell type-${order.order_type}">${order.order_type.toUpperCase()}</div>
                <div class="table-cell price">${order.platinum} ♦</div>
                <div class="table-cell">${order.quantity}</div>
                <div class="table-cell status status-${order.user.status}">${order.user.status}</div>
            </div>
        `).join('');
    }

    updateStatistics(buyOrders, sellOrders, allOrders) {
        const totalOrders = allOrders.length;
        const onlineUsers = allOrders.filter(order => order.user.status === 'online');
        const onlineSellers = sellOrders.filter(order => order.user.status === 'online').length;
        const onlineBuyers = buyOrders.filter(order => order.user.status === 'online').length;
        
        // Price calculations
        const allPrices = allOrders.map(order => order.platinum).filter(price => price > 0);
        const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : 0;
        const maxPrice = allPrices.length > 0 ? Math.max(...allPrices) : 0;
        const avgPrice = allPrices.length > 0 ? Math.round(allPrices.reduce((a, b) => a + b, 0) / allPrices.length) : 0;
        
        this.totalOrdersEl.textContent = totalOrders.toString();
        this.priceRangeEl.textContent = `${minPrice} - ${maxPrice} ♦`;
        this.averagePriceEl.textContent = `${avgPrice} ♦`;
        this.onlineSellersEl.textContent = onlineSellers.toString();
        this.onlineBuyersEl.textContent = onlineBuyers.toString();
        this.lastUpdatedEl.textContent = new Date().toLocaleTimeString();
    }

    addToRecentSearches(item) {
        // Remove if already exists
        this.recentSearches = this.recentSearches.filter(search => search.url_name !== item.url_name);
        
        // Add to beginning
        this.recentSearches.unshift(item);
        
        // Keep only last 5
        this.recentSearches = this.recentSearches.slice(0, 5);
        
        // Save to localStorage
        localStorage.setItem('recentSearches', JSON.stringify(this.recentSearches));
        
        this.loadRecentSearches();
    }

    loadRecentSearches() {
        if (this.recentSearches.length === 0) {
            this.recentList.innerHTML = '<li class="recent-item">No recent searches</li>';
            return;
        }

        this.recentList.innerHTML = this.recentSearches.map(item => `
            <li class="recent-item" data-url-name="${item.url_name}" data-item-name="${item.item_name}">
                ${item.item_name}
            </li>
        `).join('');

        // Bind click events
        this.recentList.querySelectorAll('.recent-item').forEach(item => {
            if (item.dataset.urlName) {
                item.addEventListener('click', async (e) => {
                    const urlName = e.target.dataset.urlName;
                    const itemName = e.target.dataset.itemName;
                    
                    this.searchInput.value = itemName;
                    await this.loadItemData({ url_name: urlName, item_name: itemName });
                });
            }
        });
    }

    showLoading() {
        this.welcomeMessage.classList.add('hide');
        this.loadingContainer.classList.add('show');
        this.resultsContainer.classList.remove('show');
        this.errorContainer.classList.remove('show');
    }

    showResults() {
        this.welcomeMessage.classList.add('hide');
        this.loadingContainer.classList.remove('show');
        this.resultsContainer.classList.add('show');
        this.errorContainer.classList.remove('show');
    }

    showError(message) {
        this.welcomeMessage.classList.add('hide');
        this.loadingContainer.classList.remove('show');
        this.resultsContainer.classList.remove('show');
        this.errorContainer.classList.add('show');
        
        const errorMessageEl = document.getElementById('errorMessage');
        errorMessageEl.textContent = message;
    }

    showInfo(message, duration = 3000) {
        // Create or update info notification
        let infoEl = document.getElementById('infoNotification');
        if (!infoEl) {
            infoEl = document.createElement('div');
            infoEl.id = 'infoNotification';
            infoEl.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: rgba(0, 212, 255, 0.1);
                border: 1px solid #00d4ff;
                color: #00d4ff;
                padding: 12px 16px;
                border-radius: 6px;
                font-size: 14px;
                z-index: 10000;
                max-width: 300px;
                opacity: 0;
                transform: translateX(20px);
                transition: all 0.3s ease;
            `;
            document.body.appendChild(infoEl);
        }
        
        infoEl.textContent = message;
        infoEl.style.opacity = '1';
        infoEl.style.transform = 'translateX(0)';
        
        // Auto hide after duration
        clearTimeout(this.infoTimeout);
        this.infoTimeout = setTimeout(() => {
            if (infoEl) {
                infoEl.style.opacity = '0';
                infoEl.style.transform = 'translateX(20px)';
                setTimeout(() => {
                    if (infoEl && infoEl.parentNode) {
                        infoEl.parentNode.removeChild(infoEl);
                    }
                }, 300);
            }
        }, duration);
    }

    hideResults() {
        this.welcomeMessage.classList.remove('hide');
        this.loadingContainer.classList.remove('show');
        this.resultsContainer.classList.remove('show');
        this.errorContainer.classList.remove('show');
    }

    // Alerts functionality
    async loadAlertsData() {
        console.log('Loading alerts data...');
        
        if (this.alertsLoading) {
            console.log('Showing loading state');
            this.alertsLoading.style.display = 'flex';
            this.alertsLoading.classList.add('show');
        } else {
            console.log('alertsLoading element not found');
        }
        
        try {
            console.log('Fetching world state from API...');
            const worldState = await this.alertsAPI.getWorldState();
            console.log('World state received:', worldState);
            
            this.displayCycles(worldState);
            this.displayAlerts(worldState);
            this.displayActivities(worldState);
            
            // Start real-time timer updates if we're on the alerts tab
            if (this.currentMainTab === 'alerts') {
                this.startTimerUpdates();
            }
            
            console.log('Alerts data displayed successfully');
            this.lastRefresh = Date.now(); // Track when we last refreshed
        } catch (error) {
            console.error('Failed to load alerts data:', error);
            this.showAlertsError(`Failed to load Warframe world state: ${error.message}`);
        } finally {
            if (this.alertsLoading) {
                console.log('Hiding loading state');
                this.alertsLoading.style.display = 'none';
                this.alertsLoading.classList.remove('show');
            } else {
                console.log('alertsLoading element not found in finally block');
            }
        }
    }

    displayCycles(worldState) {
        if (!this.cyclesContainer) {
            console.log('Cycles container not found');
            return;
        }
        
        console.log('Displaying cycles...');
        
        const cycles = [
            { name: 'Earth', data: worldState.earthCycle, icon: '🌍' },
            { name: 'Cetus', data: worldState.cetusCycle, icon: '🏜️' },
            { name: 'Vallis', data: worldState.vallisCycle, icon: '❄️' },
            { name: 'Cambion Drift', data: worldState.cambionCycle, icon: '🦠' },
            { name: 'Zariman', data: worldState.zarimanCycle, icon: '🚢' }
        ];
        
        console.log('Cycle data:', cycles);

        this.cyclesContainer.innerHTML = cycles.map(cycle => {
            if (!cycle.data) return '';
            
            // Get state information - use proper API fields
            let state, isDay, stateClass;
            
            if (cycle.name === 'Earth') {
                isDay = cycle.data.isDay;
                state = cycle.data.state; // 'day' or 'night'
                stateClass = isDay ? 'day' : 'night';
            } else if (cycle.name === 'Cetus') {
                isDay = cycle.data.isDay;
                state = cycle.data.state; // 'day' or 'night'
                stateClass = isDay ? 'day' : 'night';
            } else if (cycle.name === 'Vallis') {
                isDay = cycle.data.isWarm; // warm = day, cold = night
                state = cycle.data.state; // 'warm' or 'cold'
                stateClass = isDay ? 'day' : 'night';
            } else if (cycle.name === 'Cambion Drift') {
                // Cambion uses 'fass' and 'vome' instead of day/night
                isDay = cycle.data.state === 'fass';
                state = cycle.data.state; // 'fass' or 'vome'
                stateClass = isDay ? 'day' : 'night';
            } else if (cycle.name === 'Zariman') {
                // Zariman uses 'corpus' and 'grineer'
                isDay = cycle.data.isCorpus;
                state = cycle.data.state; // 'corpus' or 'grineer'
                stateClass = isDay ? 'day' : 'night';
            } else {
                // Fallback for unknown cycles
                isDay = true;
                state = 'unknown';
                stateClass = 'day';
            }
            
            // Calculate remaining time from expiry timestamp instead of parsing string
            let timeInSeconds = 0;
            if (cycle.data.expiry) {
                const now = Date.now();
                const expiryTime = new Date(cycle.data.expiry).getTime();
                timeInSeconds = Math.max(0, Math.floor((expiryTime - now) / 1000));
            }
            
            const timerId = cycle.name.toLowerCase().replace(/\s+/g, '-');
            
            // Only update timer data if this is a fresh load or if the cycle has changed state
            const existingTimer = this.cycleTimers.get(cycle.name);
            const shouldUpdateTimer = !existingTimer || 
                                    existingTimer.state !== state || 
                                    existingTimer.isDay !== isDay ||
                                    Math.abs(existingTimer.seconds - timeInSeconds) > 120; // Allow 2 minute tolerance
            
            if (shouldUpdateTimer) {
                console.log(`Updating timer for ${cycle.name}: ${timeInSeconds}s (${state}, isDay: ${isDay})`);
                this.cycleTimers.set(cycle.name, {
                    seconds: timeInSeconds,
                    state: state,
                    isDay: isDay
                });
            } else {
                console.log(`Keeping existing timer for ${cycle.name}: ${existingTimer.seconds}s`);
            }
            
            // Use the current countdown time instead of API time for display
            const displayTimer = this.cycleTimers.get(cycle.name);
            const displayTime = this.formatTimeFromSeconds(displayTimer.seconds);
            
            return `
                <div class="cycle-card ${stateClass}">
                    <div class="cycle-header">
                        <span class="cycle-icon">${cycle.icon}</span>
                        <span class="cycle-name">${cycle.name}</span>
                    </div>
                    <div class="cycle-state">${this.formatCycleState(cycle.name, state).toUpperCase()}</div>
                    <div class="cycle-timer" id="timer-${timerId}">${displayTime}</div>
                </div>
            `;
        }).join('');
    }

    displayAlerts(worldState) {
        if (!this.alertsContainer) return;
        
        console.log('Displaying alerts...');
        
        // Clear existing alert timers to prevent conflicts
        this.alertTimers.clear();
        
        const alerts = worldState.alerts || [];
        
        if (alerts.length === 0) {
            this.alertsContainer.innerHTML = '<div class="no-data">No active alerts</div>';
            return;
        }

        console.log('Alert data:', alerts);
        
        // Log detailed structure of first alert to see available data
        if (alerts.length > 0) {
            console.log('First alert detailed structure:', JSON.stringify(alerts[0], null, 2));
        }

        this.alertsContainer.innerHTML = alerts.slice(0, 8).map((alert, index) => {
            // Parse expiry time for countdown
            const expiryTime = alert.expiry ? new Date(alert.expiry).getTime() : null;
            const now = Date.now();
            const timeLeft = expiryTime ? Math.max(0, Math.floor((expiryTime - now) / 1000)) : 0;
            
            // Create unique alert ID for timer tracking
            const alertId = `alert-${index}`;
            
            // Log all available properties for debugging
            console.log(`Alert ${index} properties:`, Object.keys(alert));
            if (alert.mission) {
                console.log(`Alert ${index} mission properties:`, Object.keys(alert.mission));
            }
            
            // Get mission details
            const missionType = alert.mission?.type || 'Unknown Mission';
            const rawNode = alert.mission?.node || 'Unknown Location';
            
            // Check for additional mission data
            const description = alert.mission?.description || alert.description || '';
            const nightmare = alert.mission?.nightmare || false;
            const archwingRequired = alert.mission?.archwingRequired || false;
            const enemySpec = alert.mission?.enemySpec || '';
            const levelOverride = alert.mission?.levelOverride || '';
            const missionReward = alert.mission?.missionReward || '';
            
            // Convert node ID to readable location name
            let node = this.nodeMap.get(rawNode) || rawNode;
            
            // If still showing internal ID, try to make it more readable
            if (node.startsWith('SolNode')) {
                // Extract number and make a generic location name
                const nodeNum = rawNode.replace('SolNode', '');
                const planets = ['Earth', 'Venus', 'Mercury', 'Mars', 'Ceres', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto', 'Sedna', 'Eris', 'Void'];
                const planetIndex = Math.floor(parseInt(nodeNum) / 50);
                const planet = planets[planetIndex] || 'Unknown Planet';
                node = `${rawNode} (${planet})`;
            }
            
            const faction = alert.mission?.faction || 'Unknown';
            const level = alert.mission?.minEnemyLevel && alert.mission?.maxEnemyLevel 
                ? `${alert.mission.minEnemyLevel}-${alert.mission.maxEnemyLevel}` 
                : 'Unknown';
            
            // Get reward information
            const rewards = alert.mission?.reward || {};
            const credits = rewards.credits ? `${rewards.credits.toLocaleString()} cr` : '';
            const items = rewards.items || [];
            const countedItems = rewards.countedItems || [];
            
            // Format display time
            const displayTime = timeLeft > 0 ? this.formatTimeFromSeconds(timeLeft) : 'Expired';
            
            // Store alert timer data
            if (timeLeft > 0) {
                this.alertTimers.set(alertId, {
                    seconds: timeLeft,
                    expiry: expiryTime
                });
                console.log(`Alert timer set for ${alertId}: ${timeLeft}s (${displayTime})`);
            } else {
                console.log(`Alert ${alertId} already expired or no expiry time`);
            }
            
            return `
                <div class="alert-card ${timeLeft <= 300 ? 'expiring-soon' : ''}">
                    <div class="alert-header">
                        <div class="alert-mission-info">
                            <div class="alert-type">
                                ${missionType}
                                ${nightmare ? '<span class="mission-modifier nightmare">NIGHTMARE</span>' : ''}
                                ${archwingRequired ? '<span class="mission-modifier archwing">ARCHWING</span>' : ''}
                            </div>
                            <div class="alert-location">${node}</div>
                            ${description ? `<div class="alert-description">${description}</div>` : ''}
                            <div class="alert-details">
                                <span class="alert-faction">${faction}</span>
                                <span class="alert-level">Level ${level}</span>
                                ${enemySpec ? `<span class="alert-enemy-spec">${enemySpec}</span>` : ''}
                            </div>
                        </div>
                        <div class="alert-timer-section">
                            <div class="alert-timer" id="${alertId}-timer">${displayTime}</div>
                        </div>
                    </div>
                    
                    <div class="alert-rewards">
                        <div class="rewards-header">Rewards:</div>
                        <div class="rewards-content">
                            ${credits ? `<span class="reward-credits">${credits}</span>` : ''}
                            ${items.map(item => `<span class="reward-item">${item}</span>`).join('')}
                            ${countedItems.map(item => `<span class="reward-item">${item.count}x ${item.type}</span>`).join('')}
                            ${missionReward ? `<span class="reward-item mission-reward">${missionReward}</span>` : ''}
                            ${(!credits && items.length === 0 && countedItems.length === 0 && !missionReward) ? '<span class="reward-item">Unknown Rewards</span>' : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    displayActivities(worldState) {
        if (!this.activitiesContainer) return;
        
        // Store worldState data for detailed views
        this.currentWorldState = worldState;
        
        // Remember which activity details are currently expanded
        const expandedActivities = new Set();
        this.activitiesContainer.querySelectorAll('.activity-card.expanded').forEach(card => {
            expandedActivities.add(card.dataset.activityType);
        });
        
        const activities = [];
        
        if (worldState.invasions && worldState.invasions.length > 0) {
            // Count only active invasions
            const activeInvasions = worldState.invasions.filter(invasion => {
                const isActive = invasion.completion < 100 && !invasion.completed;
                const notExpired = !invasion.expiry || new Date(invasion.expiry) > new Date();
                return isActive && notExpired;
            });
            
            if (activeInvasions.length > 0) {
                activities.push({
                    type: 'Invasions',
                    count: activeInvasions.length,
                    icon: '⚔️',
                    id: 'invasions'
                });
            }
        }
        
        if (worldState.fissures && worldState.fissures.length > 0) {
            activities.push({
                type: 'Void Fissures',
                count: worldState.fissures.length,
                icon: '🔮',
                id: 'fissures'
            });
        }
        
        if (worldState.sortie) {
            activities.push({
                type: 'Daily Sortie',
                count: 1,
                icon: '🎯',
                id: 'sortie'
            });
        }

        if (activities.length === 0) {
            this.activitiesContainer.innerHTML = '<div class="no-data">No active activities</div>';
            return;
        }

        this.activitiesContainer.innerHTML = activities.map(activity => {
            const isExpanded = expandedActivities.has(activity.id);
            return `
                <div class="activity-card clickable ${isExpanded ? 'expanded' : ''}" data-activity-type="${activity.id}" style="cursor: pointer;">
                    <div class="activity-card-header">
                        <span class="activity-icon">${activity.icon}</span>
                        <div class="activity-info">
                            <div class="activity-type">${activity.type}</div>
                            <div class="activity-count">${activity.count} active</div>
                        </div>
                        <div class="expand-indicator">${isExpanded ? '▲' : '▼'}</div>
                    </div>
                    <div class="activity-details" id="${activity.id}-details" style="display: ${isExpanded ? 'block' : 'none'};"></div>
                </div>
            `;
        }).join('');
        
        // Add click event listeners
        this.activitiesContainer.querySelectorAll('.activity-card.clickable').forEach(card => {
            card.addEventListener('click', (e) => {
                const activityType = card.dataset.activityType;
                this.toggleActivityDetails(activityType);
            });
        });
        
        // Re-populate expanded details
        expandedActivities.forEach(activityType => {
            const detailsContainer = document.getElementById(`${activityType}-details`);
            if (detailsContainer) {
                this.loadActivityDetails(activityType, detailsContainer);
            }
        });
    }

    toggleActivityDetails(activityType) {
        const detailsContainer = document.getElementById(`${activityType}-details`);
        const card = detailsContainer.closest('.activity-card');
        const expandIndicator = card.querySelector('.expand-indicator');
        
        if (detailsContainer.style.display === 'none') {
            // Show details
            this.loadActivityDetails(activityType, detailsContainer);
            detailsContainer.style.display = 'block';
            expandIndicator.textContent = '▲';
            card.classList.add('expanded');
        } else {
            // Hide details
            detailsContainer.style.display = 'none';
            expandIndicator.textContent = '▼';
            card.classList.remove('expanded');
        }
    }

    loadActivityDetails(activityType, container) {
        if (!this.currentWorldState) return;
        
        switch (activityType) {
            case 'fissures':
                this.displayFissureDetails(container);
                break;
            case 'invasions':
                this.displayInvasionDetails(container);
                break;
            case 'sortie':
                this.displaySortieDetails(container);
                break;
        }
    }

    displayFissureDetails(container) {
        const allFissures = this.currentWorldState.fissures || [];
        
        if (allFissures.length === 0) {
            container.innerHTML = '<div class="no-details">No void fissures available</div>';
            return;
        }

        // Clear existing fissure timers
        this.fissureTimers.clear();
        
        // Filter for active fissures only
        const now = Date.now();
        const activeFissures = allFissures.filter(fissure => {
            const isActive = fissure.active !== false && fissure.ACTIVE !== false;
            const isExpired = fissure.expired === true || fissure.EXPIRED === true;
            const expiryTime = fissure.expiry || fissure.EXPIRY || fissure.Expiry;
            const hasValidExpiry = expiryTime && new Date(expiryTime).getTime() > now;
            
            return isActive && !isExpired && hasValidExpiry;
        });

        console.log(`Total fissures: ${allFissures.length}, Active fissures: ${activeFissures.length}`);

        // Define the tier order for sorting
        const tierOrder = ['Lith', 'Meso', 'Neo', 'Axi', 'Requiem', 'Omnia'];
        
        // Sort fissures by tier, then by time remaining
        const sortedFissures = activeFissures.sort((a, b) => {
            // Access tier with both uppercase and lowercase variants
            const getTier = (fissure) => fissure.tier || fissure.TIER || fissure.Tier || 'Unknown';
            
            const tierA = getTier(a);
            const tierB = getTier(b);
            
            const tierIndexA = tierOrder.indexOf(tierA) === -1 ? 999 : tierOrder.indexOf(tierA);
            const tierIndexB = tierOrder.indexOf(tierB) === -1 ? 999 : tierOrder.indexOf(tierB);
            
            if (tierIndexA !== tierIndexB) {
                return tierIndexA - tierIndexB; // Sort by tier first
            }
            
            // If same tier, sort by expiry time (closest to expiring first)
            const getExpiry = (fissure) => fissure.expiry || fissure.EXPIRY || fissure.Expiry || '9999-12-31';
            const timeA = new Date(getExpiry(a)).getTime();
            const timeB = new Date(getExpiry(b)).getTime();
            return timeA - timeB;
        });

        // Count different variants
        const availableTiers = [...new Set(activeFissures.map(f => f.tier || f.TIER).filter(Boolean))];
        const steelPathCount = activeFissures.filter(f => f.isHard || f.ISHARD).length;
        const voidStormCount = activeFissures.filter(f => f.isStorm || f.ISSTORM).length;
        
        console.log('Debug fissure variants:', {
            steelPath: steelPathCount,
            voidStorm: voidStormCount,
            availableTiers
        });
        
        container.innerHTML = `
            <div class="activity-detail-header">
                Void Fissures (${activeFissures.length}) 
                <br><small>Available tiers: ${availableTiers.join(', ')} | Steel Path: ${steelPathCount} | Void Storms: ${voidStormCount}</small>
            </div>
            <div class="fissures-list">
                ${sortedFissures.map((fissure, index) => {
                    const isHard = fissure.isHard || fissure.ISHARD;
                    const isStorm = fissure.isStorm || fissure.ISSTORM;
                    
                    let variantTags = [];
                    if (isHard) variantTags.push('<span class="steel-path-indicator">🛡️ Steel Path</span>');
                    if (isStorm) variantTags.push('<span class="void-storm-indicator">🌪️ Void Storm</span>');
                    
                    // Calculate time remaining and create unique fissure ID
                    const expiryTime = fissure.expiry || fissure.EXPIRY || fissure.Expiry;
                    const fissureId = `fissure-${index}`;
                    let timeLeft = 0;
                    let displayTime = 'Unknown time';
                    
                    if (expiryTime) {
                        const expiryTimestamp = new Date(expiryTime).getTime();
                        timeLeft = Math.max(0, Math.floor((expiryTimestamp - now) / 1000));
                        displayTime = timeLeft > 0 ? this.formatTimeFromSeconds(timeLeft) : 'Expired';
                        
                        // Store fissure timer data for real-time updates
                        if (timeLeft > 0) {
                            this.fissureTimers.set(fissureId, {
                                seconds: timeLeft,
                                expiry: expiryTimestamp
                            });
                        }
                    }
                    
                    return `
                        <div class="fissure-item">
                            <div class="fissure-header">
                                <span class="fissure-tier ${(fissure.tier || fissure.TIER || fissure.Tier || 'unknown').toLowerCase()}">${fissure.tier || fissure.TIER || fissure.Tier || 'Unknown'}</span>
                                ${variantTags.join('')}
                                <span class="fissure-type">${this.formatFissureMissionType(fissure)}</span>
                            </div>
                            <div class="fissure-location">${this.nodeMap.get(fissure.node || fissure.NODE) || fissure.node || fissure.NODE || 'Unknown Location'}</div>
                            <div class="fissure-details">
                                <span class="fissure-enemy">${fissure.enemy || fissure.ENEMY || 'Unknown'}</span>
                                <span class="fissure-timer" id="${fissureId}-timer">${displayTime}</span>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    displayInvasionDetails(container) {
        const allInvasions = this.currentWorldState.invasions || [];
        
        // Filter for active invasions (not completed and not expired)
        const invasions = allInvasions.filter(invasion => {
            const isActive = invasion.completion < 100 && !invasion.completed;
            const notExpired = !invasion.expiry || new Date(invasion.expiry) > new Date();
            return isActive && notExpired;
        });
        
        if (invasions.length === 0) {
            container.innerHTML = '<div class="no-details">No active invasions available</div>';
            return;
        }

        // Debug: Log the first invasion to understand the structure
        if (invasions.length > 0) {
            console.log('First active invasion structure:', JSON.stringify(invasions[0], null, 2));
            console.log('Attacker data:', invasions[0].attacker);
            console.log('Defender data:', invasions[0].defender);
            console.log('Mission type:', invasions[0].missionType);
            console.log('Available invasion properties:', Object.keys(invasions[0]));
        }

        container.innerHTML = `
            <div class="activity-detail-header">Invasions (${invasions.length})</div>
            <div class="invasions-list">
                ${invasions.slice(0, 8).map(invasion => `
                    <div class="invasion-item">
                        <div class="invasion-header">
                            <span class="invasion-location">${this.nodeMap.get(invasion.node) || invasion.node || 'Unknown Location'}</span>
                            <div class="invasion-progress-container">
                                ${this.renderInvasionProgress(invasion)}
                            </div>
                        </div>
                        <div class="invasion-factions">
                            ${this.renderInvasionFactions(invasion)}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    displaySortieDetails(container) {
        const sortie = this.currentWorldState.sortie;
        
        if (!sortie) {
            container.innerHTML = '<div class="no-details">No daily sortie available</div>';
            return;
        }

        container.innerHTML = `
            <div class="activity-detail-header">Daily Sortie</div>
            <div class="sortie-details">
                <div class="sortie-header">
                    <span class="sortie-boss">${sortie.boss || 'Unknown Boss'}</span>
                    <span class="sortie-faction">${sortie.faction || 'Unknown Faction'}</span>
                </div>
                <div class="sortie-reward">
                    <strong>Reward Pool:</strong> ${sortie.rewardPool || 'Unknown rewards'}
                </div>
                <div class="sortie-missions">
                    ${(sortie.variants || []).map((mission, index) => `
                        <div class="sortie-mission">
                            <div class="mission-header">
                                <span class="mission-number">Mission ${index + 1}</span>
                                <span class="mission-type">${mission.missionType || 'Unknown'}</span>
                            </div>
                            <div class="mission-location">${this.nodeMap.get(mission.node) || mission.node || 'Unknown Location'}</div>
                            <div class="mission-modifier">${mission.modifier || 'No modifier'}</div>
                            <div class="mission-description">${mission.modifierDescription || ''}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    renderInvasionProgress(invasion) {
        // Get attacker and defender progress
        const attackerFaction = invasion.attackingFaction || invasion.attacker?.faction || 'Unknown';
        const defenderFaction = invasion.defendingFaction || invasion.defender?.faction || 'Unknown';
        
        // In Warframe invasions, completion is typically how close the attacking faction is to winning
        const attackerProgress = Math.round(invasion.completion || 0);
        const defenderProgress = 100 - attackerProgress;
        
        // Check if either side is Infested (for styling purposes)
        const attackerIsInfested = this.isInfestedFaction(attackerFaction);
        const defenderIsInfested = this.isInfestedFaction(defenderFaction);
        
        // Always show both percentages, but style Infested differently
        return `
            <div class="invasion-progress-split">
                <span class="progress-attacker ${attackerIsInfested ? 'infested' : ''}">${attackerFaction}: ${attackerProgress}%</span>
                <span class="progress-separator">|</span>
                <span class="progress-defender ${defenderIsInfested ? 'infested' : ''}">${defenderFaction}: ${defenderProgress}%</span>
            </div>
        `;
    }

    renderInvasionFactions(invasion) {
        const attackerReward = invasion.attacker?.reward || invasion.attackerReward || (invasion.rewardTypes?.[0]);
        const defenderReward = invasion.defender?.reward || invasion.defenderReward || (invasion.rewardTypes?.[1]);
        
        const attackerFaction = invasion.attackingFaction || invasion.attacker?.faction || 'Unknown';
        const defenderFaction = invasion.defendingFaction || invasion.defender?.faction || 'Unknown';
        
        // Check if either side is Infested
        const attackerIsInfested = this.isInfestedFaction(attackerFaction);
        const defenderIsInfested = this.isInfestedFaction(defenderFaction);
        
        // Get progress percentages
        const attackerProgress = Math.round(invasion.completion || 0);
        const defenderProgress = 100 - attackerProgress;
        
        // Format rewards
        const attackerRewardText = this.formatInvasionReward(attackerReward);
        const defenderRewardText = this.formatInvasionReward(defenderReward);
        
        // Determine what to show in reward slots
        const attackerRewardDisplay = attackerIsInfested ? '' : attackerRewardText;
        const defenderRewardDisplay = defenderIsInfested ? '' : defenderRewardText;
        
        // Always show both sides, but style Infested differently
        return `
            <div class="faction-side attacker ${attackerIsInfested ? 'infested' : ''}">
                <span class="faction-name">${attackerFaction}</span>
                <div class="faction-reward-container">
                    <div class="faction-reward-progress" style="width: ${attackerProgress}%"></div>
                    <div class="faction-reward">${attackerRewardDisplay}</div>
                </div>
            </div>
            <div class="vs-indicator">VS</div>
            <div class="faction-side defender ${defenderIsInfested ? 'infested' : ''}">
                <span class="faction-name">${defenderFaction}</span>
                <div class="faction-reward-container">
                    <div class="faction-reward-progress" style="width: ${defenderProgress}%"></div>
                    <div class="faction-reward">${defenderRewardDisplay}</div>
                </div>
            </div>
        `;
    }

    isInfestedFaction(faction) {
        if (!faction || typeof faction !== 'string') return false;
        
        const factionLower = faction.toLowerCase();
        return factionLower.includes('infested') || 
               factionLower.includes('infestation') ||
               factionLower === 'infested';
    }

    isValidInvasionSide(reward, rewardText, faction) {
        // Basic validation
        if (!reward) return false;
        if (rewardText === 'No reward' || rewardText === 'Unknown reward') return false;
        if (faction === 'Unknown') return false;
        
        // Check if reward is meaningful
        if (typeof rewardText === 'string') {
            const cleaned = rewardText.toLowerCase().trim();
            if (cleaned === '' || cleaned === 'undefined' || cleaned === 'null') return false;
            if (cleaned.length < 3) return false;
        }
        
        return true;
    }

    formatInvasionReward(reward) {
        if (!reward) return 'No reward';
        
        // If it's a simple string, clean it up and capitalize properly
        if (typeof reward === 'string') {
            return this.cleanRewardString(reward);
        }
        
        // Try different possible property names for the reward
        if (reward.asString) return this.cleanRewardString(reward.asString);
        if (reward.itemString) return this.cleanRewardString(reward.itemString);
        if (reward.name) return this.cleanRewardString(reward.name);
        if (reward.item) return this.cleanRewardString(reward.item);
        if (reward.type) return this.cleanRewardString(reward.type);
        
        // Try toString method
        if (reward.toString && typeof reward.toString === 'function' && reward.toString !== Object.prototype.toString) {
            const stringResult = reward.toString();
            if (stringResult !== '[object Object]') return this.cleanRewardString(stringResult);
        }
        
        // If it's an object with countedItems or items
        if (reward.countedItems && Array.isArray(reward.countedItems) && reward.countedItems.length > 0) {
            return reward.countedItems.map(item => `${item.count || 1}x ${this.cleanRewardString(item.type || item.name || item.item || 'Unknown')}`).join(', ');
        }
        
        if (reward.items && Array.isArray(reward.items) && reward.items.length > 0) {
            return reward.items.map(item => this.cleanRewardString(item)).join(', ');
        }
        
        // Try credits
        if (reward.credits && reward.credits > 0) {
            return `${reward.credits.toLocaleString()} cr`;
        }
        
        // Try to extract any meaningful string from the object
        const possibleKeys = ['reward', 'itemName', 'description', 'displayName', 'title'];
        for (const key of possibleKeys) {
            if (reward[key] && typeof reward[key] === 'string') {
                return this.cleanRewardString(reward[key]);
            }
        }
        
        // Log the reward structure for debugging with all properties
        console.log('Unknown reward structure:', reward);
        console.log('Reward keys:', Object.keys(reward));
        
        return 'Unknown reward';
    }

    cleanRewardString(str) {
        if (typeof str !== 'string') return str;
        
        // Map common incomplete reward names to their full names
        const rewardMappings = {
            'mutagen': 'Mutagen Mass',
            'detonite': 'Detonite Injector',
            'fieldron': 'Fieldron',
            'catalyst': 'Orokin Catalyst',
            'reactor': 'Orokin Reactor',
            'forma': 'Forma',
            'exilus': 'Exilus Adapter',
            'umbral': 'Umbral Forma'
        };
        
        let cleaned = str.trim();
        
        // Check if it's a simple lowercase reward that needs mapping
        const lowerStr = cleaned.toLowerCase();
        if (rewardMappings[lowerStr]) {
            cleaned = rewardMappings[lowerStr];
        } else if (Object.keys(rewardMappings).some(key => lowerStr.includes(key))) {
            // If it contains a known key, try to map it
            for (const [key, value] of Object.entries(rewardMappings)) {
                if (lowerStr.includes(key)) {
                    // Check for numbers before the key
                    const match = cleaned.match(new RegExp(`(\\d+)\\s*${key}`, 'i'));
                    if (match) {
                        cleaned = `${match[1]} ${value}`;
                    } else {
                        cleaned = value;
                    }
                    break;
                }
            }
        } else {
            // Capitalize first letter of each word
            cleaned = cleaned.split(' ')
                           .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                           .join(' ');
        }
        
        return cleaned
            .replace(/(\d+)x\s*(.+)/, '$1x $2') // Format "3xMutagen Mass" to "3x Mutagen Mass"
            .replace(/Blueprint/g, 'BP') // Shorten Blueprint
            .replace(/\s+/g, ' ') // Clean multiple spaces
            .trim();
    }

    showAlertsError(message) {
        if (this.cyclesContainer) {
            this.cyclesContainer.innerHTML = `<div class="error-message">${message}</div>`;
        }
    }

    startAlertsRefresh() {
        this.stopAlertsRefresh();
        this.alertsRefreshInterval = setInterval(() => {
            // Only refresh if no timers are actively counting down or if it's been more than 2 minutes
            const hasActiveTimers = Array.from(this.cycleTimers.values()).some(timer => timer.seconds > 0 && timer.seconds < 7200); // 2 hours
            const shouldRefresh = !hasActiveTimers || !this.lastRefresh || (Date.now() - this.lastRefresh) > 120000; // 2 minutes
            
            if (shouldRefresh) {
                console.log('Regular refresh triggered');
                this.loadAlertsData();
            } else {
                console.log('Skipping refresh - timers are active');
            }
        }, 60000); // Check every minute
    }

    stopAlertsRefresh() {
        if (this.alertsRefreshInterval) {
            clearInterval(this.alertsRefreshInterval);
            this.alertsRefreshInterval = null;
        }
    }

    setupElectronFeatures() {
        // Add keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl+F or Cmd+F - Focus search
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                this.searchInput.focus();
                this.searchInput.select();
            }
            
            // Ctrl+L or Cmd+L - Clear search
            if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
                e.preventDefault();
                this.searchInput.value = '';
                this.searchInput.focus();
                this.hideSuggestions();
            }
            
            // F5 - Refresh current item data
            if (e.key === 'F5') {
                e.preventDefault();
                if (this.currentItem) {
                    this.loadItemData(this.currentItem);
                }
            }
        });

        // Enhanced error handling with Electron dialog
        this.originalShowError = this.showError;
        this.showError = (message) => {
            this.originalShowError(message);
            
            // Show native error dialog for critical errors
            if (window.electronAPI && message.includes('Failed to load')) {
                window.electronAPI.showMessageBox({
                    type: 'error',
                    title: 'Connection Error',
                    message: 'Unable to connect to Warframe Market',
                    detail: message,
                    buttons: ['Retry', 'Cancel']
                }).then((result) => {
                    if (result.response === 0) { // Retry button
                        this.handleRetry();
                    }
                });
            }
        };

        // Add window title updates
        this.originalDisplayItemData = this.displayItemData;
        this.displayItemData = (item, orders) => {
            this.originalDisplayItemData(item, orders);
            
            // Update window title with current item
            document.title = `${item.item_name} - Warframe Market Tracker`;
        };

        console.log('Electron features initialized');
    }
    
    // Format cycle state names for display
    formatCycleState(cycleName, state) {
        switch (cycleName) {
            case 'Earth':
            case 'Cetus':
                return state; // 'day' or 'night'
            case 'Vallis':
                return state; // 'warm' or 'cold'
            case 'Cambion Drift':
                return state; // 'fass' or 'vome'
            case 'Zariman':
                return state; // 'corpus' or 'grineer'
            default:
                return state || 'unknown';
        }
    }
    
    // Format fissure mission types with proper prefixes
    formatFissureMissionType(fissure) {
        const baseMissionType = fissure.missionType || fissure.MISSIONTYPE || fissure.MissionType || 'Unknown Mission';
        const isStorm = fissure.isStorm || fissure.ISSTORM;
        const node = fissure.node || fissure.NODE || '';
        
        // For Void Storms, add "Void Storm" prefix
        if (isStorm) {
            // Map Orphix missions in Void Storms to Spy
            if (baseMissionType === 'Orphix') {
                return 'Void Storm Spy';
            }
            return `Void Storm ${baseMissionType}`;
        }
        
        // Check if this is a Conjunction Survival mission on Lua
        // Yuvarium and Circulus on Lua are always Conjunction Survival missions
        if (baseMissionType === 'Survival' && (node.includes('Yuvarium (Lua)') || node.includes('Circulus (Lua)'))) {
            return 'Conjunction Survival';
        }
        
        // Map API mission type names to proper display names
        if (baseMissionType === 'Corruption') {
            return 'Void Flood';
        }
        
        // For all other fissures, use the mission type exactly as provided by the API
        return baseMissionType;
    }
    
    // Utility function to parse time strings like "44m 10s" or "1h 23m" into seconds
    parseTimeString(timeStr) {
        if (!timeStr) return 0;
        
        let totalSeconds = 0;
        const timeRegex = /(\d+)([dhms])/g;
        let match;
        
        while ((match = timeRegex.exec(timeStr)) !== null) {
            const value = parseInt(match[1]);
            const unit = match[2];
            
            switch (unit) {
                case 'd': totalSeconds += value * 24 * 60 * 60; break;
                case 'h': totalSeconds += value * 60 * 60; break;
                case 'm': totalSeconds += value * 60; break;
                case 's': totalSeconds += value; break;
            }
        }
        
        return totalSeconds;
    }
    
    // Format seconds back into readable time string
    formatTimeFromSeconds(seconds) {
        if (seconds <= 0) return 'Expired';
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        let result = '';
        if (hours > 0) result += `${hours}h `;
        if (minutes > 0) result += `${minutes}m `;
        if (secs > 0 || result === '') result += `${secs}s`;
        
        return result.trim();
    }
    
    // Start real-time timer updates
    startTimerUpdates() {
        this.stopTimerUpdates();
        this.timerUpdateInterval = setInterval(() => {
            this.updateTimers();
        }, 1000); // Update every second
    }
    
    // Stop timer updates
    stopTimerUpdates() {
        if (this.timerUpdateInterval) {
            clearInterval(this.timerUpdateInterval);
            this.timerUpdateInterval = null;
        }
    }
    
    // Update all timers by decreasing by 1 second
    updateTimers() {
        // Update cycle timers
        this.cycleTimers.forEach((timerData, cycleName) => {
            if (timerData.seconds > 0) {
                timerData.seconds--;
                const timerElement = document.getElementById(`timer-${cycleName.toLowerCase().replace(/\s+/g, '-')}`);
                if (timerElement) {
                    timerElement.textContent = this.formatTimeFromSeconds(timerData.seconds);
                    
                    // Add warning class if less than 5 minutes remaining
                    if (timerData.seconds <= 300) { // 5 minutes
                        timerElement.classList.add('warning');
                    } else {
                        timerElement.classList.remove('warning');
                    }
                }
            } else if (timerData.seconds === 0) {
                // Timer expired - could refresh data or show notification
                const timerElement = document.getElementById(`timer-${cycleName.toLowerCase().replace(/\s+/g, '-')}`);
                if (timerElement) {
                    timerElement.textContent = 'Cycle changing...';
                    timerElement.classList.add('warning');
                }
            }
        });
        
        // Update alert timers
        this.alertTimers.forEach((timerData, alertId) => {
            if (timerData.seconds > 0) {
                timerData.seconds--;
                const timerElement = document.getElementById(`${alertId}-timer`);
                if (timerElement) {
                    timerElement.textContent = this.formatTimeFromSeconds(timerData.seconds);
                    // Debug logging every 30 seconds
                    if (timerData.seconds % 30 === 0) {
                        console.log(`Alert ${alertId} timer: ${timerData.seconds}s remaining`);
                    }
                    
                    // Add warning class if less than 5 minutes remaining
                    if (timerData.seconds <= 300) { // 5 minutes
                        timerElement.classList.add('warning');
                        // Also add warning to the alert card
                        const alertCard = timerElement.closest('.alert-card');
                        if (alertCard) {
                            alertCard.classList.add('expiring-soon');
                        }
                    } else {
                        timerElement.classList.remove('warning');
                        const alertCard = timerElement.closest('.alert-card');
                        if (alertCard) {
                            alertCard.classList.remove('expiring-soon');
                        }
                    }
                } else {
                    console.warn(`Alert timer element not found: ${alertId}-timer`);
                }
            } else if (timerData.seconds === 0) {
                // Alert expired
                const timerElement = document.getElementById(`${alertId}-timer`);
                if (timerElement) {
                    timerElement.textContent = 'Expired';
                    timerElement.classList.add('warning');
                    const alertCard = timerElement.closest('.alert-card');
                    if (alertCard) {
                        alertCard.classList.add('expired');
                    }
                }
            }
        });
        
        // Update fissure timers
        this.fissureTimers.forEach((timerData, fissureId) => {
            if (timerData.seconds > 0) {
                timerData.seconds--;
                const timerElement = document.getElementById(`${fissureId}-timer`);
                if (timerElement) {
                    timerElement.textContent = this.formatTimeFromSeconds(timerData.seconds);
                    
                    // Add warning class if less than 5 minutes remaining
                    if (timerData.seconds <= 300) { // 5 minutes
                        timerElement.classList.add('warning');
                        // Also add warning to the fissure item
                        const fissureItem = timerElement.closest('.fissure-item');
                        if (fissureItem) {
                            fissureItem.classList.add('expiring-soon');
                        }
                    } else {
                        timerElement.classList.remove('warning');
                        const fissureItem = timerElement.closest('.fissure-item');
                        if (fissureItem) {
                            fissureItem.classList.remove('expiring-soon');
                        }
                    }
                }
            } else if (timerData.seconds === 0) {
                // Fissure expired
                const timerElement = document.getElementById(`${fissureId}-timer`);
                if (timerElement) {
                    timerElement.textContent = 'Expired';
                    timerElement.classList.add('warning');
                    const fissureItem = timerElement.closest('.fissure-item');
                    if (fissureItem) {
                        fissureItem.classList.add('expired');
                    }
                }
            }
        });
        
        // Check if any timer has expired and refresh data if needed (but only once per expiry)
        const expiredCycleTimers = Array.from(this.cycleTimers.entries()).filter(([name, timer]) => timer.seconds === 0);
        const expiredAlertTimers = Array.from(this.alertTimers.entries()).filter(([name, timer]) => timer.seconds === 0);
        const expiredFissureTimers = Array.from(this.fissureTimers.entries()).filter(([name, timer]) => timer.seconds === 0);
        
        if ((expiredCycleTimers.length > 0 || expiredAlertTimers.length > 0 || expiredFissureTimers.length > 0) && !this.pendingRefresh) {
            this.pendingRefresh = true;
            console.log('Timers expired, scheduling refresh in 15 seconds...');
            // Refresh the data in 15 seconds to get updates
            setTimeout(() => {
                if (this.currentMainTab === 'alerts') {
                    console.log('Refreshing data due to expired timers');
                    this.loadAlertsData();
                }
                this.pendingRefresh = false;
            }, 15000);
        }
    }

    // Test function for debugging alerts
    async testAlertsAPI() {
        console.log('Testing alerts API...');
        try {
            const data = await this.alertsAPI.getWorldState();
            console.log('API test successful:', data);
            return data;
        } catch (error) {
            console.error('API test failed:', error);
            return null;
        }
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new WarframeMarketApp();
    
    // Make app instance available globally for Electron menu interactions
    window.app = app;
    
    // Set up Electron-specific functionality if available
    if (window.electronAPI) {
        console.log('Running in Electron environment');
        
        // Add Electron-specific enhancements
        app.setupElectronFeatures();
    }
});

// Add some utility functions for enhanced functionality
class Utils {
    static formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    static timeAgo(date) {
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);
        
        if (diffInSeconds < 60) return 'just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
        return `${Math.floor(diffInSeconds / 86400)}d ago`;
    }

    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
}

// Export for potential module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WarframeMarketApp, WarframeMarketAPI, Utils };
}