<template>
  <AuthGuard>
    <div id="app" class="min-h-screen bg-gray-50">
      <header class="bg-primary-700 text-white shadow-lg">
        <div class="max-w-screen-2xl mx-auto px-4 py-2 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <img src="/redhat-logo.svg" alt="Red Hat" class="h-8" />
            <h1 class="text-xl font-bold">AI Engineering Bug Classifier</h1>
          </div>
          <div class="flex items-center gap-4">
            <div v-if="lastUpdated" class="text-sm text-primary-100">
              Last Updated: {{ formatDate(lastUpdated) }}
            </div>
            <!-- Split refresh button -->
            <div class="relative flex">
              <button
                @click="refreshData(false)"
                :disabled="isRefreshing"
                class="px-3 py-1 text-sm bg-white text-primary-700 rounded-l-md font-medium hover:bg-primary-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
              >
                <svg
                  v-if="isRefreshing"
                  class="animate-spin h-4 w-4"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <svg
                  v-else
                  class="h-4 w-4"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {{ isRefreshing ? 'Refreshing...' : 'Refresh' }}
              </button>
              <button
                @click="showRefreshMenu = !showRefreshMenu"
                :disabled="isRefreshing"
                class="px-1.5 py-1 text-sm bg-white text-primary-700 rounded-r-md font-medium hover:bg-primary-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border-l border-primary-200"
              >
                <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <!-- Dropdown -->
              <div
                v-if="showRefreshMenu"
                class="absolute right-0 top-full mt-1 w-48 bg-white rounded-md shadow-lg py-1 z-20"
              >
                <button
                  @click="refreshData(true); showRefreshMenu = false"
                  class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  <div class="font-medium">Hard Refresh</div>
                  <div class="text-xs text-gray-500">Re-fetch and reclassify all bugs</div>
                </button>
              </div>
            </div>

            <!-- User Avatar and Sign Out -->
            <div class="relative" v-if="authUser">
              <button
                @click="showUserMenu = !showUserMenu"
                class="flex items-center gap-2 hover:bg-primary-600 rounded-full p-1 transition-colors"
              >
                <div
                  v-if="!authUser.photoURL || avatarLoadError"
                  class="h-8 w-8 rounded-full border-2 border-white bg-white text-primary-700 flex items-center justify-center font-bold text-xs"
                >
                  {{ getUserInitials(authUser) }}
                </div>
                <img
                  v-else
                  :src="authUser.photoURL"
                  :alt="authUser.displayName || authUser.email"
                  class="h-8 w-8 rounded-full border-2 border-white"
                  @error="avatarLoadError = true"
                />
              </button>

              <!-- Dropdown menu -->
              <div
                v-if="showUserMenu"
                class="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-lg py-1 z-10"
              >
                <div class="px-4 py-2 border-b border-gray-200">
                  <p class="text-sm font-medium text-gray-900">{{ authUser.displayName }}</p>
                  <p class="text-xs text-gray-500 truncate">{{ authUser.email }}</p>
                </div>
                <button
                  @click="handleSignOut"
                  class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                >
                  <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <!-- Navigation -->
      <nav class="bg-white shadow">
        <div class="max-w-screen-2xl mx-auto px-4">
          <div class="flex space-x-8">
            <button
              @click="currentView = 'dashboard'"
              :class="[
                'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                currentView === 'dashboard'
                  ? 'border-primary-700 text-primary-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              ]"
            >
              Dashboard
            </button>
            <button
              @click="currentView = 'bug-list'"
              :class="[
                'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                currentView === 'bug-list'
                  ? 'border-primary-700 text-primary-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              ]"
            >
              Bug List
            </button>
          </div>
        </div>
      </nav>

      <!-- Refresh progress bar -->
      <div v-if="isRefreshing" class="bg-white border-b border-gray-200 px-6 py-3 shadow-sm">
        <div class="max-w-screen-2xl mx-auto">
          <div class="flex items-center justify-between mb-1">
            <span class="text-sm font-medium text-gray-700">{{ refreshProgressMessage }}</span>
            <span class="text-sm text-gray-500">{{ refreshProgressPercent }}%</span>
          </div>
          <div class="w-full bg-gray-200 rounded-full h-2">
            <div
              class="bg-primary-600 h-2 rounded-full transition-all duration-300"
              :style="{ width: refreshProgressPercent + '%' }"
            ></div>
          </div>
        </div>
      </div>

      <!-- Main content -->
      <main class="relative">
        <DashboardView
          v-if="currentView === 'dashboard'"
          :summary="summary"
          :isLoading="isLoading"
        />
        <BugListView
          v-else-if="currentView === 'bug-list'"
          :bugs="bugs"
          :isLoading="isLoading"
        />
      </main>

      <!-- Toasts -->
      <Toast
        v-for="toast in toasts"
        :key="toast.id"
        :message="toast.message"
        :type="toast.type"
        :duration="toast.duration"
        @close="removeToast(toast.id)"
      />
    </div>
  </AuthGuard>
</template>

<script>
import AuthGuard from './components/AuthGuard.vue';
import DashboardView from './components/DashboardView.vue';
import BugListView from './components/BugListView.vue';
import LoadingOverlay from './components/LoadingOverlay.vue';
import Toast from './components/Toast.vue';
import { useAuth } from './composables/useAuth';
import { refreshBugs, getBugs, getSummary } from './services/api';

export default {
  name: 'App',
  components: {
    AuthGuard,
    DashboardView,
    BugListView,
    LoadingOverlay,
    Toast
  },
  setup() {
    const { user: authUser, signOut } = useAuth();
    return {
      authUser,
      signOut
    };
  },
  data() {
    return {
      currentView: 'dashboard',
      bugs: [],
      summary: null,
      lastUpdated: null,
      isRefreshing: false,
      isLoading: false,
      showUserMenu: false,
      avatarLoadError: false,
      toasts: [],
      projectKey: 'RHOAIENG',
      refreshProgressPercent: 0,
      refreshProgressMessage: 'Starting refresh...',
      showRefreshMenu: false
    };
  },
  watch: {
    authUser(newUser, oldUser) {
      this.avatarLoadError = false;

      if (newUser && !oldUser) {
        this.loadData();
      }
    },
    currentView() {
      // Reload data when switching tabs to ensure fresh state
      if (this.authUser && !this.isLoading && !this.isRefreshing) {
        this.loadData();
      }
    }
  },
  mounted() {
    document.addEventListener('click', this.handleClickOutside);

    if (this.authUser) {
      this.loadData();
    }
  },
  beforeUnmount() {
    document.removeEventListener('click', this.handleClickOutside);
  },
  methods: {
    async loadData() {
      this.isLoading = true;
      try {
        const [bugsData, summaryData] = await Promise.all([
          getBugs({ project: this.projectKey }),
          getSummary(this.projectKey)
        ]);

        this.bugs = bugsData.bugs || [];
        this.lastUpdated = bugsData.lastUpdated || summaryData.lastUpdated;
        this.summary = summaryData;
      } catch (error) {
        console.error('Failed to load data:', error);

        if (error.message.includes('No data found')) {
          this.showToast('No data found. Click Refresh to fetch bugs from Jira.', 'info', 5000);
        } else if (error.message.includes('Authentication')) {
          this.showToast('Authentication failed. Please sign in again.', 'error');
        } else {
          this.showToast(`Failed to load data: ${error.message}`, 'error');
        }

        this.bugs = [];
        this.summary = null;
      } finally {
        this.isLoading = false;
      }
    },

    async refreshData(hardRefresh = false) {
      this.isRefreshing = true;
      this.refreshProgressPercent = 0;
      this.refreshProgressMessage = 'Starting refresh...';

      try {
        const result = await refreshBugs(this.projectKey, {
          concurrency: 20,
          hardRefresh,
          onProgress: (data) => {
            if (data.phase === 'fetching') {
              this.refreshProgressPercent = 5;
              this.refreshProgressMessage = data.message || 'Fetching bugs from Jira...';
            } else if (data.phase === 'classifying') {
              const total = data.total || 1;
              const classified = data.classified || 0;
              // Reserve 5-100% for classifying phase
              this.refreshProgressPercent = Math.round(5 + (classified / total) * 95);
              this.refreshProgressMessage = data.message || `Classifying: ${classified}/${total}`;
            }
          }
        });

        this.refreshProgressPercent = 100;
        this.showToast(`Successfully refreshed ${result.totalBugs} bugs! Classified ${result.classified}, skipped ${result.skipped}.`, 'success', 5000);

        // Reload data
        await this.loadData();
      } catch (error) {
        console.error('Refresh error:', error);

        if (error.message.includes('Authentication')) {
          this.showToast('Authentication failed. Please sign in again.', 'error');
        } else {
          this.showToast(`Failed to refresh: ${error.message}`, 'error');
        }
      } finally {
        this.isRefreshing = false;
        this.refreshProgressPercent = 0;
        this.refreshProgressMessage = 'Starting refresh...';
      }
    },

    async handleSignOut() {
      this.showUserMenu = false;
      await this.signOut();
    },

    handleClickOutside(event) {
      if (!event.target.closest('.relative')) {
        this.showUserMenu = false;
        this.showRefreshMenu = false;
      }
    },

    formatDate(dateString) {
      const date = new Date(dateString);
      return date.toLocaleString();
    },

    showToast(message, type = 'success', duration = 3000) {
      const id = Date.now();
      this.toasts.push({ id, message, type, duration });
    },

    removeToast(id) {
      this.toasts = this.toasts.filter(t => t.id !== id);
    },

    getUserInitials(user) {
      if (!user) return '?';

      if (user.displayName) {
        const parts = user.displayName.split(' ');
        if (parts.length >= 2) {
          return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return user.displayName.substring(0, 2).toUpperCase();
      }

      if (user.email) {
        return user.email.substring(0, 2).toUpperCase();
      }

      return '??';
    }
  }
}
</script>
