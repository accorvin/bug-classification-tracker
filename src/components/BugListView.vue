<template>
  <div class="container mx-auto px-6 py-8">
    <h2 class="text-2xl font-bold text-gray-900 mb-6">Bug List</h2>

    <!-- Filter bar -->
    <FilterBar
      :priorities="availablePriorities"
      :teams="availableTeams"
      @filter-change="handleFilterChange"
    />

    <!-- Loading state -->
    <div v-if="isLoading" class="text-center py-12">
      <p class="text-gray-500">Loading bugs...</p>
    </div>

    <!-- Bug list -->
    <div v-else-if="filteredBugs.length > 0" class="bg-white rounded-lg shadow overflow-hidden">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Key
              </th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Summary
              </th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Priority
              </th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Classification
              </th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Team
              </th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Created
              </th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <template v-for="bug in filteredBugs" :key="bug.key">
              <tr
                @click="toggleExpanded(bug.key)"
                class="hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-primary-700">
                  <a
                    :href="`https://issues.redhat.com/browse/${bug.key}`"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="hover:underline"
                    @click.stop
                  >
                    {{ bug.key }}
                  </a>
                </td>
                <td class="px-6 py-4 text-sm text-gray-900">
                  <div class="max-w-md truncate">{{ bug.summary }}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ bug.priority }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <ClassificationBadge
                    :classification="bug.classification"
                    :method="bug.classificationMethod"
                    :reason="bug.classificationReason"
                  />
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ bug.team }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ bug.status }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ formatDate(bug.created) }}
                </td>
              </tr>
              <!-- Expanded details row -->
              <tr v-if="expandedBugKey === bug.key" :key="`${bug.key}-details`" class="bg-gray-50">
                <td colspan="7" class="px-6 py-4">
                  <div class="space-y-3">
                    <div>
                      <span class="text-sm font-medium text-gray-700">Description:</span>
                      <p class="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{{ truncateDescription(bug.description) }}</p>
                    </div>
                    <div>
                      <span class="text-sm font-medium text-gray-700">Classification Reason:</span>
                      <p class="text-sm text-gray-600 mt-1">{{ bug.classificationReason }}</p>
                    </div>
                    <div class="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span class="font-medium text-gray-700">Assignee:</span>
                        <span class="text-gray-600 ml-2">{{ bug.assignee || 'Unassigned' }}</span>
                      </div>
                      <div>
                        <span class="font-medium text-gray-700">Reporter:</span>
                        <span class="text-gray-600 ml-2">{{ bug.reporter || 'Unknown' }}</span>
                      </div>
                      <div>
                        <span class="font-medium text-gray-700">Component:</span>
                        <span class="text-gray-600 ml-2">{{ bug.component }}</span>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>

    <!-- No results state -->
    <div v-else class="text-center py-12 bg-white rounded-lg shadow">
      <p class="text-gray-500">No bugs found matching the current filters.</p>
    </div>
  </div>
</template>

<script>
import ClassificationBadge from './ClassificationBadge.vue';
import FilterBar from './FilterBar.vue';

export default {
  name: 'BugListView',
  components: {
    ClassificationBadge,
    FilterBar
  },
  props: {
    bugs: {
      type: Array,
      default: () => []
    },
    isLoading: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      filters: {},
      expandedBugKey: null
    };
  },
  computed: {
    filteredBugs() {
      let bugs = [...this.bugs];

      if (this.filters.classification) {
        bugs = bugs.filter(b => b.classification === this.filters.classification);
      }
      if (this.filters.priority) {
        bugs = bugs.filter(b => b.priority === this.filters.priority);
      }
      if (this.filters.team) {
        bugs = bugs.filter(b => b.team === this.filters.team);
      }

      return bugs;
    },
    availablePriorities() {
      return [...new Set(this.bugs.map(b => b.priority))].sort();
    },
    availableTeams() {
      return [...new Set(this.bugs.map(b => b.team))].sort();
    }
  },
  methods: {
    handleFilterChange(filters) {
      this.filters = filters;
    },
    toggleExpanded(bugKey) {
      this.expandedBugKey = this.expandedBugKey === bugKey ? null : bugKey;
    },
    truncateDescription(desc) {
      if (!desc) return 'No description';
      return desc.length > 500 ? desc.substring(0, 500) + '...' : desc;
    },
    formatDate(dateString) {
      if (!dateString) return 'N/A';
      return new Date(dateString).toLocaleDateString();
    }
  }
}
</script>
