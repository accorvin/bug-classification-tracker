<template>
  <div class="bg-white rounded-lg shadow p-4 mb-6">
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      <!-- Search -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Search</label>
        <div class="relative">
          <input
            :value="searchQuery"
            @input="$emit('search-change', $event.target.value)"
            type="text"
            placeholder="Key or summary..."
            class="w-full pl-8 rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
          />
          <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      <!-- Classification filter -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Classification</label>
        <select
          v-model="filters.classification"
          @change="emitChange"
          class="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
        >
          <option value="">All</option>
          <option value="regression">Regression</option>
          <option value="usability">Usability</option>
          <option value="general-engineering">General Engineering</option>
          <option value="uncategorized">Uncategorized</option>
        </select>
      </div>

      <!-- Priority filter -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Priority</label>
        <select
          v-model="filters.priority"
          @change="emitChange"
          class="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
        >
          <option value="">All</option>
          <option v-for="priority in priorities" :key="priority" :value="priority">
            {{ priority }}
          </option>
        </select>
      </div>

      <!-- Team filter -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Team</label>
        <select
          v-model="filters.team"
          @change="emitChange"
          class="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
        >
          <option value="">All</option>
          <option v-for="team in teams" :key="team" :value="team">
            {{ team }}
          </option>
        </select>
      </div>

      <!-- Clear button -->
      <div class="flex items-end">
        <button
          @click="clearFilters"
          class="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
        >
          Clear Filters
        </button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'FilterBar',
  props: {
    priorities: {
      type: Array,
      default: () => []
    },
    teams: {
      type: Array,
      default: () => []
    },
    searchQuery: {
      type: String,
      default: ''
    }
  },
  emits: ['filter-change', 'search-change'],
  data() {
    return {
      filters: {
        classification: '',
        priority: '',
        team: '',
        dateFrom: '',
        dateTo: ''
      }
    }
  },
  methods: {
    emitChange() {
      this.$emit('filter-change', { ...this.filters });
    },
    clearFilters() {
      this.filters = {
        classification: '',
        priority: '',
        team: '',
        dateFrom: '',
        dateTo: ''
      };
      this.emitChange();
      this.$emit('search-change', '');
    }
  }
}
</script>
