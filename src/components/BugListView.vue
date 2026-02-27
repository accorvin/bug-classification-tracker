<template>
  <div class="px-8 py-8">
    <h2 class="text-2xl font-bold text-gray-900 mb-6">Bug List</h2>

    <FilterBar
      :priorities="availablePriorities"
      :teams="availableTeams"
      :searchQuery="searchQuery"
      @filter-change="handleFilterChange"
      @search-change="handleSearchChange"
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
                  <div class="space-y-4">
                    <!-- Metadata grid -->
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-sm bg-white rounded-md p-3 border border-gray-200">
                      <div>
                        <span class="font-medium text-gray-500">Classification Reason</span>
                        <p class="text-gray-900 mt-0.5">{{ bug.classificationReason }}</p>
                      </div>
                      <div>
                        <span class="font-medium text-gray-500">Assignee</span>
                        <p class="text-gray-900 mt-0.5">{{ bug.assignee || 'Unassigned' }}</p>
                      </div>
                      <div>
                        <span class="font-medium text-gray-500">Reporter</span>
                        <p class="text-gray-900 mt-0.5">{{ bug.reporter || 'Unknown' }}</p>
                      </div>
                      <div>
                        <span class="font-medium text-gray-500">Component</span>
                        <p class="text-gray-900 mt-0.5">{{ bug.component }}</p>
                      </div>
                      <div v-if="bug.fixVersions && bug.fixVersions.length">
                        <span class="font-medium text-gray-500">Fix Version</span>
                        <p class="text-gray-900 mt-0.5">{{ bug.fixVersions.join(', ') }}</p>
                      </div>
                      <div v-if="bug.affectsVersions && bug.affectsVersions.length">
                        <span class="font-medium text-gray-500">Affects Version</span>
                        <p class="text-gray-900 mt-0.5">{{ bug.affectsVersions.join(', ') }}</p>
                      </div>
                    </div>

                    <!-- Description -->
                    <div>
                      <span class="text-sm font-medium text-gray-700">Description:</span>
                      <div class="text-sm text-gray-600 mt-1 prose prose-sm max-w-none" v-html="renderDescription(bug.description)"></div>
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
import J2M from 'jira2md';

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
      expandedBugKey: null,
      searchQuery: ''
    };
  },
  computed: {
    filteredBugs() {
      let bugs = [...this.bugs];

      if (this.searchQuery.trim()) {
        const q = this.searchQuery.trim().toLowerCase();
        bugs = bugs.filter(b =>
          b.key.toLowerCase().includes(q) ||
          (b.summary && b.summary.toLowerCase().includes(q))
        );
      }
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
    handleSearchChange(query) {
      this.searchQuery = query;
    },
    toggleExpanded(bugKey) {
      this.expandedBugKey = this.expandedBugKey === bugKey ? null : bugKey;
    },
    renderDescription(desc) {
      if (!desc) return '<em>No description</em>';
      try {
        const truncated = desc.length > 3000 ? desc.substring(0, 3000) + '\n\n...' : desc;
        return J2M.jira_to_html(truncated);
      } catch (e) {
        const escaped = desc.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `<pre>${escaped.substring(0, 3000)}</pre>`;
      }
    },
    formatDate(dateString) {
      if (!dateString) return 'N/A';
      return new Date(dateString).toLocaleDateString();
    }
  }
}
</script>
