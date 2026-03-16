<template>
  <div class="space-y-6">
    <!-- Month selectors -->
    <div class="bg-white rounded-lg shadow p-5">
      <div class="flex items-center gap-4 flex-wrap">
        <div class="flex items-center gap-2">
          <label class="text-sm font-medium text-gray-600">From:</label>
          <select v-model="fromId" @change="computeComparison" class="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-primary-500 focus:border-primary-500">
            <option v-for="s in snapshotList" :key="s.id" :value="s.id">{{ formatLabel(s.id) }}</option>
          </select>
        </div>
        <div class="flex items-center gap-2">
          <label class="text-sm font-medium text-gray-600">To:</label>
          <select v-model="toId" @change="computeComparison" class="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-primary-500 focus:border-primary-500">
            <option v-for="s in snapshotList" :key="s.id" :value="s.id">{{ formatLabel(s.id) }}</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="text-center py-8">
      <p class="text-gray-500">Loading comparison...</p>
    </div>

    <!-- Same month selected -->
    <div v-else-if="fromId === toId" class="text-center py-8">
      <p class="text-gray-500">Select two different months to compare.</p>
    </div>

    <!-- Comparison results -->
    <template v-else-if="comparison">
      <!-- Global delta cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-white rounded-lg shadow p-5">
          <div class="text-sm font-medium text-gray-500">Total Bugs</div>
          <div class="text-2xl font-bold mt-1" :class="deltaColor(comparison.global.totalBugsDelta, true)">
            {{ formatDelta(comparison.global.totalBugsDelta) }}
          </div>
        </div>
        <div v-for="cat in classificationCategories" :key="cat" class="bg-white rounded-lg shadow p-5">
          <div class="text-sm font-medium text-gray-500">{{ categoryLabel(cat) }}</div>
          <div v-if="comparison.global.byClassification[cat]" class="text-2xl font-bold mt-1" :class="deltaColor(comparison.global.byClassification[cat].delta, true)">
            {{ formatDelta(comparison.global.byClassification[cat].delta) }}
          </div>
          <div v-if="comparison.global.byClassification[cat]" class="text-xs text-gray-400 mt-1">
            {{ comparison.global.byClassification[cat].from }} → {{ comparison.global.byClassification[cat].to }}
          </div>
        </div>
      </div>

      <!-- Velocity summary -->
      <div class="bg-white rounded-lg shadow p-5">
        <h3 class="text-lg font-medium text-gray-900 mb-3">Velocity</h3>
        <div class="grid grid-cols-3 gap-4">
          <div class="text-center">
            <div class="text-sm text-gray-500">Inflow</div>
            <div class="text-2xl font-bold text-red-600">+{{ comparison.velocity.inflow }}</div>
            <div class="text-xs text-gray-400">bugs appeared</div>
          </div>
          <div class="text-center">
            <div class="text-sm text-gray-500">Outflow</div>
            <div class="text-2xl font-bold text-green-600">-{{ comparison.velocity.outflow }}</div>
            <div class="text-xs text-gray-400">bugs resolved</div>
          </div>
          <div class="text-center">
            <div class="text-sm text-gray-500">Net Change</div>
            <div class="text-2xl font-bold" :class="deltaColor(comparison.velocity.netChange, true)">
              {{ formatDelta(comparison.velocity.netChange) }}
            </div>
          </div>
        </div>
      </div>

      <!-- Export button -->
      <div class="flex justify-end">
        <button
          @click="exportCsv"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
        >
          <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Export CSV
        </button>
      </div>

      <!-- Per-release delta table -->
      <div class="bg-white rounded-lg shadow p-6">
        <h3 class="text-lg font-medium text-gray-900 mb-4">By Release</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b text-left">
                <th class="pb-2 font-medium text-gray-600">Release</th>
                <th class="pb-2 font-medium text-gray-600 text-right">From</th>
                <th class="pb-2 font-medium text-gray-600 text-right">To</th>
                <th class="pb-2 font-medium text-gray-600 text-right">Delta</th>
                <th class="pb-2 font-medium text-gray-600 text-right">Inflow</th>
                <th class="pb-2 font-medium text-gray-600 text-right">Outflow</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="release in sortedReleaseDeltas" :key="release.name" class="border-b last:border-0">
                <td class="py-2 font-medium text-gray-900">{{ release.name }}</td>
                <td class="py-2 text-right text-gray-600">{{ release.data.fromTotal }}</td>
                <td class="py-2 text-right text-gray-600">{{ release.data.toTotal }}</td>
                <td class="py-2 text-right font-medium" :class="deltaColor(release.data.totalBugsDelta, true)">
                  {{ formatDelta(release.data.totalBugsDelta) }}
                </td>
                <td class="py-2 text-right text-red-600">{{ release.data.inflow > 0 ? '+' + release.data.inflow : '—' }}</td>
                <td class="py-2 text-right text-green-600">{{ release.data.outflow > 0 ? '-' + release.data.outflow : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<script>
import { getSnapshot } from '../services/api';
import { compareSnapshots } from '../utils/snapshot-compare';
import { exportComparisonCsv } from '../utils/csv-export';

export default {
  name: 'SnapshotCompare',
  props: {
    snapshotList: { type: Array, required: true }
  },
  data() {
    return {
      fromId: null,
      toId: null,
      comparison: null,
      isLoading: false,
      snapshotCache: {}
    };
  },
  computed: {
    classificationCategories() {
      return ['regression', 'usability', 'general-engineering'];
    },
    sortedReleaseDeltas() {
      if (!this.comparison) return [];
      return Object.entries(this.comparison.releases)
        .map(([name, data]) => ({ name, data }))
        .filter(r => r.data.totalBugsDelta !== 0 || r.data.inflow > 0 || r.data.outflow > 0)
        .sort((a, b) => {
          const specialOrder = { 'Unversioned': 2, 'Pre-2.16': 1 };
          const aSpecial = specialOrder[a.name] || 0;
          const bSpecial = specialOrder[b.name] || 0;
          if (aSpecial !== bSpecial) return aSpecial - bSpecial;
          return b.name.localeCompare(a.name, undefined, { numeric: true });
        });
    }
  },
  mounted() {
    if (this.snapshotList.length >= 2) {
      this.toId = this.snapshotList[0].id;
      this.fromId = this.snapshotList[1].id;
      this.computeComparison();
    }
  },
  methods: {
    async fetchSnapshot(id) {
      if (this.snapshotCache[id]) return this.snapshotCache[id];
      const snapshot = await getSnapshot(id);
      this.snapshotCache[id] = snapshot;
      return snapshot;
    },
    async computeComparison() {
      if (!this.fromId || !this.toId || this.fromId === this.toId) {
        this.comparison = null;
        return;
      }
      this.isLoading = true;
      try {
        const [fromSnapshot, toSnapshot] = await Promise.all([
          this.fetchSnapshot(this.fromId),
          this.fetchSnapshot(this.toId)
        ]);
        this.comparison = compareSnapshots(fromSnapshot, toSnapshot);
      } catch (error) {
        console.error('Failed to compute comparison:', error);
        this.comparison = null;
      } finally {
        this.isLoading = false;
      }
    },
    formatLabel(id) {
      const [year, month] = id.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1);
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    },
    formatDelta(n) {
      if (n > 0) return '+' + n;
      if (n === 0) return '0';
      return String(n);
    },
    deltaColor(n, invertIsGood) {
      if (n === 0) return 'text-gray-600';
      if (invertIsGood) {
        return n < 0 ? 'text-green-600' : 'text-red-600';
      }
      return n > 0 ? 'text-green-600' : 'text-red-600';
    },
    exportCsv() {
      if (this.comparison) exportComparisonCsv(this.comparison);
    },
    categoryLabel(cat) {
      const labels = {
        'regression': 'Regression',
        'usability': 'Usability',
        'general-engineering': 'Engineering',
        'uncategorized': 'Uncategorized'
      };
      return labels[cat] || cat;
    }
  }
};
</script>
