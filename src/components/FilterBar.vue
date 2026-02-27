<template>
  <div class="bg-white rounded-lg shadow p-4 mb-6">
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
    }
  },
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
    }
  }
}
</script>
