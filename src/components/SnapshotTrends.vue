<template>
  <div class="space-y-6">
    <!-- Loading -->
    <div v-if="isLoading" class="text-center py-8">
      <p class="text-gray-500">Loading trend data...</p>
    </div>

    <!-- Not enough data -->
    <div v-else-if="snapshots.length < 2" class="text-center py-8">
      <p class="text-gray-500">At least two snapshots are needed to show trends.</p>
    </div>

    <template v-else>
      <!-- Total bugs over time -->
      <div class="bg-white rounded-lg shadow p-6">
        <h3 class="text-lg font-medium text-gray-900 mb-4">Total Bugs Over Time</h3>
        <div class="h-72">
          <Line :data="totalBugsChartData" :options="lineChartOptions" />
        </div>
      </div>

      <!-- Classification breakdown per month (stacked bar) -->
      <div class="bg-white rounded-lg shadow p-6">
        <h3 class="text-lg font-medium text-gray-900 mb-4">Classification Breakdown Over Time</h3>
        <div class="h-72">
          <Bar :data="classificationChartData" :options="stackedBarOptions" />
        </div>
      </div>

      <!-- Velocity chart (inflow vs outflow) -->
      <div v-if="velocityData.length > 0" class="bg-white rounded-lg shadow p-6">
        <h3 class="text-lg font-medium text-gray-900 mb-4">Velocity: Inflow vs. Outflow</h3>
        <div class="h-72">
          <Bar :data="velocityChartData" :options="groupedBarOptions" />
        </div>
      </div>

      <!-- Export button -->
      <div class="flex justify-end">
        <button
          @click="exportCsv"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
        >
          <svg
            class="h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          Export CSV
        </button>
      </div>

      <!-- Per-release trends table -->
      <div class="bg-white rounded-lg shadow p-6">
        <h3 class="text-lg font-medium text-gray-900 mb-4">Per-Release Net Change</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b text-left">
                <th class="pb-2 font-medium text-gray-600">Release</th>
                <th
                  v-for="s in snapshots"
                  :key="s.snapshotId"
                  class="pb-2 font-medium text-gray-600 text-right"
                >
                  {{ formatLabel(s.snapshotId) }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="release in topReleases" :key="release" class="border-b last:border-0">
                <td class="py-2 font-medium text-gray-900">{{ release }}</td>
                <td v-for="(s, idx) in snapshots" :key="s.snapshotId" class="py-2 text-right">
                  <span class="text-gray-600">{{ getReleaseCount(s, release) }}</span>
                  <span
                    v-if="idx > 0"
                    class="ml-1 text-xs"
                    :class="
                      netChangeColor(
                        getReleaseCount(s, release) - getReleaseCount(snapshots[idx - 1], release),
                      )
                    "
                  >
                    {{
                      formatSmallDelta(
                        getReleaseCount(s, release) - getReleaseCount(snapshots[idx - 1], release),
                      )
                    }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<script>
import { Line, Bar } from 'vue-chartjs';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { getSnapshot } from '../services/api';
import { compareSnapshots } from '../utils/snapshot-compare';
import { exportTrendsCsv } from '../utils/csv-export';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

export default {
  name: 'SnapshotTrends',
  components: { Line, Bar },
  props: {
    snapshotList: { type: Array, required: true },
  },
  data() {
    return {
      snapshots: [],
      velocityData: [],
      isLoading: false,
    };
  },
  computed: {
    labels() {
      return this.snapshots.map((s) => this.formatLabel(s.snapshotId));
    },
    totalBugsChartData() {
      return {
        labels: this.labels,
        datasets: [
          {
            label: 'Total Bugs',
            data: this.snapshots.map((s) => s.totalBugs),
            borderColor: '#1d4ed8',
            backgroundColor: 'rgba(29, 78, 216, 0.1)',
            fill: true,
            tension: 0.3,
          },
        ],
      };
    },
    classificationChartData() {
      const categories = ['regression', 'usability', 'general-engineering', 'uncategorized'];
      const colors = {
        regression: { bg: 'rgba(220, 38, 38, 0.8)', border: '#dc2626' },
        usability: { bg: 'rgba(234, 88, 12, 0.8)', border: '#ea580c' },
        'general-engineering': { bg: 'rgba(37, 99, 235, 0.8)', border: '#2563eb' },
        uncategorized: { bg: 'rgba(156, 163, 175, 0.8)', border: '#9ca3af' },
      };
      const categoryLabels = {
        regression: 'Regression',
        usability: 'Usability',
        'general-engineering': 'Engineering',
        uncategorized: 'Uncategorized',
      };

      return {
        labels: this.labels,
        datasets: categories.map((cat) => ({
          label: categoryLabels[cat],
          data: this.snapshots.map((s) => (s.global?.byClassification || {})[cat] || 0),
          backgroundColor: colors[cat].bg,
          borderColor: colors[cat].border,
          borderWidth: 1,
        })),
      };
    },
    velocityChartData() {
      return {
        labels: this.velocityData.map((v) => v.label),
        datasets: [
          {
            label: 'Inflow (new bugs)',
            data: this.velocityData.map((v) => v.inflow),
            backgroundColor: 'rgba(220, 38, 38, 0.7)',
            borderColor: '#dc2626',
            borderWidth: 1,
          },
          {
            label: 'Outflow (resolved)',
            data: this.velocityData.map((v) => v.outflow),
            backgroundColor: 'rgba(22, 163, 74, 0.7)',
            borderColor: '#16a34a',
            borderWidth: 1,
          },
        ],
      };
    },
    lineChartOptions() {
      return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: false } },
      };
    },
    stackedBarOptions() {
      return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: {
          x: { stacked: true },
          y: { stacked: true, beginAtZero: true },
        },
      };
    },
    groupedBarOptions() {
      return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true } },
      };
    },
    topReleases() {
      // Get releases that appear in the most recent snapshot, excluding special groups
      const latest = this.snapshots[this.snapshots.length - 1];
      if (!latest) return [];
      return Object.entries(latest.releases || {})
        .filter(([name]) => name !== 'Unversioned' && name !== 'Pre-2.16')
        .sort((a, b) => b[1].totalBugs - a[1].totalBugs)
        .slice(0, 10)
        .map(([name]) => name);
    },
  },
  async mounted() {
    await this.loadAllSnapshots();
  },
  methods: {
    async loadAllSnapshots() {
      if (this.snapshotList.length < 2) return;
      this.isLoading = true;
      try {
        const fetches = this.snapshotList.map((s) => getSnapshot(s.id));
        const results = await Promise.all(fetches);
        // Sort chronologically (oldest first)
        this.snapshots = results.sort((a, b) => a.snapshotId.localeCompare(b.snapshotId));

        // Compute velocity between consecutive pairs
        this.velocityData = [];
        for (let i = 1; i < this.snapshots.length; i++) {
          const comparison = compareSnapshots(this.snapshots[i - 1], this.snapshots[i]);
          this.velocityData.push({
            snapshotId: this.snapshots[i].snapshotId,
            label: this.formatLabel(this.snapshots[i].snapshotId),
            inflow: comparison.velocity.inflow,
            outflow: comparison.velocity.outflow,
            netChange: comparison.velocity.netChange,
          });
        }
      } catch (error) {
        console.error('Failed to load snapshots for trends:', error);
      } finally {
        this.isLoading = false;
      }
    },
    getReleaseCount(snapshot, release) {
      return snapshot.releases?.[release]?.totalBugs || 0;
    },
    formatLabel(id) {
      const [year, month] = id.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1);
      return date.toLocaleDateString('en-US', { year: '2-digit', month: 'short' });
    },
    formatSmallDelta(n) {
      if (n === 0) return '';
      return n > 0 ? `+${n}` : String(n);
    },
    exportCsv() {
      if (this.snapshots.length > 0) exportTrendsCsv(this.snapshots, this.velocityData);
    },
    netChangeColor(n) {
      if (n === 0) return 'text-gray-400';
      return n < 0 ? 'text-green-600' : 'text-red-600';
    },
  },
};
</script>
