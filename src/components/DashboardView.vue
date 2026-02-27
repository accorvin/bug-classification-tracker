<template>
  <div class="max-w-5xl mx-auto px-8 py-8">
    <h2 class="text-2xl font-bold text-gray-900 mb-6">Bug Classification Dashboard</h2>

    <!-- Loading state -->
    <div v-if="isLoading" class="text-center py-12">
      <p class="text-gray-500">Loading dashboard data...</p>
    </div>

    <!-- Summary cards -->
    <div v-else-if="summary" class="space-y-8">
      <!-- Total bugs card -->
      <div class="bg-white rounded-lg shadow p-6">
        <h3 class="text-lg font-medium text-gray-900 mb-2">Total Bugs</h3>
        <p class="text-4xl font-bold text-primary-700">{{ summary.totalBugs }}</p>
      </div>

      <!-- Classification breakdown -->
      <div class="bg-white rounded-lg shadow p-6">
        <h3 class="text-lg font-medium text-gray-900 mb-4">Classification Breakdown</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div
            v-for="(data, category) in summary.byClassification"
            :key="category"
            class="border rounded-lg p-4 relative group"
            :class="categoryBorderClass(category)"
          >
            <div class="flex items-center gap-1.5">
              <div class="text-sm font-medium text-gray-600 mb-1">{{ categoryLabel(category) }}</div>
              <div class="relative mb-1">
                <svg class="h-3.5 w-3.5 text-gray-400 cursor-help" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-gray-900 text-white text-xs rounded-lg p-2.5 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 pointer-events-none">
                  {{ categoryDescription(category) }}
                  <div class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                </div>
              </div>
            </div>
            <div class="text-2xl font-bold" :class="categoryTextClass(category)">
              {{ data.count }}
            </div>
            <div class="text-xs text-gray-500">
              {{ percentage(data.count, summary.totalBugs) }}%
            </div>
          </div>
        </div>

        <!-- Allocation bar -->
        <div class="h-8 flex rounded-lg overflow-hidden">
          <div
            v-for="(data, category) in summary.byClassification"
            :key="category"
            :style="{ width: percentage(data.count, summary.totalBugs) + '%' }"
            :class="categoryBgClass(category)"
            class="flex items-center justify-center text-xs font-medium text-white"
            :title="`${categoryLabel(category)}: ${data.count} (${percentage(data.count, summary.totalBugs)}%)`"
          >
            <span v-if="percentage(data.count, summary.totalBugs) > 5">
              {{ percentage(data.count, summary.totalBugs) }}%
            </span>
          </div>
        </div>
      </div>

      <!-- Priority breakdown -->
      <div class="bg-white rounded-lg shadow p-6">
        <h3 class="text-lg font-medium text-gray-900 mb-4">By Priority</h3>
        <div class="space-y-3">
          <div
            v-for="(count, priority) in summary.byPriority"
            :key="priority"
            class="flex items-center justify-between"
          >
            <span class="text-sm font-medium text-gray-700">{{ priority }}</span>
            <div class="flex items-center gap-3">
              <div class="w-48 bg-gray-200 rounded-full h-2">
                <div
                  class="bg-primary-600 h-2 rounded-full"
                  :style="{ width: percentage(count, summary.totalBugs) + '%' }"
                ></div>
              </div>
              <span class="text-sm text-gray-600 w-16 text-right">{{ count }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Team breakdown -->
      <div class="bg-white rounded-lg shadow p-6">
        <h3 class="text-lg font-medium text-gray-900 mb-4">By Team</h3>
        <div class="space-y-3">
          <div
            v-for="(count, team) in summary.byTeam"
            :key="team"
            class="flex items-center justify-between"
          >
            <span class="text-sm font-medium text-gray-700">{{ team }}</span>
            <div class="flex items-center gap-3">
              <div class="w-48 bg-gray-200 rounded-full h-2">
                <div
                  class="bg-green-600 h-2 rounded-full"
                  :style="{ width: percentage(count, summary.totalBugs) + '%' }"
                ></div>
              </div>
              <span class="text-sm text-gray-600 w-16 text-right">{{ count }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- No data state -->
    <div v-else class="text-center py-12">
      <p class="text-gray-500">No data available. Click Refresh to fetch bugs from Jira.</p>
    </div>
  </div>
</template>

<script>
export default {
  name: 'DashboardView',
  props: {
    summary: {
      type: Object,
      default: null
    },
    isLoading: {
      type: Boolean,
      default: false
    }
  },
  methods: {
    percentage(count, total) {
      if (total === 0) return 0;
      return Math.round((count / total) * 100);
    },
    categoryLabel(category) {
      const labels = {
        'regression': 'Regression',
        'usability': 'Usability',
        'general-engineering': 'General Engineering',
        'uncategorized': 'Uncategorized'
      };
      return labels[category] || category;
    },
    categoryDescription(category) {
      const descriptions = {
        'regression': 'Bugs that broke previously working functionality. Detected via "regression" labels or keywords.',
        'usability': 'UI/UX issues, confusing workflows, and accessibility problems. Detected via UX labels or components.',
        'general-engineering': 'Logic errors, crashes, performance issues, and missing validation. Classified by LLM analysis.',
        'uncategorized': 'Bugs that could not be confidently classified by rules or LLM.'
      };
      return descriptions[category] || '';
    },
    categoryBorderClass(category) {
      const classes = {
        'regression': 'border-red-200',
        'usability': 'border-blue-200',
        'general-engineering': 'border-green-200',
        'uncategorized': 'border-gray-200'
      };
      return classes[category] || 'border-gray-200';
    },
    categoryTextClass(category) {
      const classes = {
        'regression': 'text-red-700',
        'usability': 'text-blue-700',
        'general-engineering': 'text-green-700',
        'uncategorized': 'text-gray-700'
      };
      return classes[category] || 'text-gray-700';
    },
    categoryBgClass(category) {
      const classes = {
        'regression': 'bg-red-500',
        'usability': 'bg-blue-500',
        'general-engineering': 'bg-green-500',
        'uncategorized': 'bg-gray-400'
      };
      return classes[category] || 'bg-gray-400';
    }
  }
}
</script>
