<template>
  <div class="max-w-5xl mx-auto px-8 py-8">
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-2xl font-bold text-gray-900">Release Snapshots</h2>
      <div v-if="snapshotList.length > 0 && subView === 'current'" class="flex items-center gap-2">
        <label for="snapshot-select" class="text-sm font-medium text-gray-600">Snapshot:</label>
        <select
          id="snapshot-select"
          v-model="selectedSnapshotId"
          @change="loadSnapshot"
          class="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-primary-500 focus:border-primary-500"
        >
          <option v-for="s in snapshotList" :key="s.id" :value="s.id">
            {{ formatSnapshotLabel(s.id) }} ({{ s.totalBugs }} bugs)
          </option>
        </select>
      </div>
    </div>

    <!-- Sub-navigation -->
    <div v-if="snapshotList.length > 0" class="border-b border-gray-200 mb-6">
      <div class="flex space-x-6">
        <button
          v-for="tab in subTabs"
          :key="tab.id"
          @click="subView = tab.id"
          :class="[
            'pb-3 text-sm font-medium border-b-2 transition-colors',
            subView === tab.id
              ? 'border-primary-700 text-primary-700'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          ]"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="isLoading && subView === 'current'" class="text-center py-12">
      <p class="text-gray-500">Loading snapshot data...</p>
    </div>

    <!-- No snapshots available -->
    <div v-else-if="snapshotList.length === 0 && !isLoading" class="text-center py-12">
      <p class="text-gray-500">No snapshots available. Run <code class="bg-gray-100 px-2 py-0.5 rounded">npm run refresh</code> to generate the first snapshot.</p>
    </div>

    <!-- Current Snapshot sub-view -->
    <div v-else-if="subView === 'current' && snapshot" class="space-y-6">
      <!-- Top-level summary cards -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="bg-white rounded-lg shadow p-5">
          <div class="text-sm font-medium text-gray-500">Total Bugs</div>
          <div class="text-3xl font-bold text-primary-700 mt-1">{{ snapshot.totalBugs }}</div>
        </div>
        <div class="bg-white rounded-lg shadow p-5">
          <div class="text-sm font-medium text-gray-500">Versioned</div>
          <div class="text-3xl font-bold text-green-600 mt-1">{{ snapshot.versionedBugs }}</div>
          <div class="text-xs text-gray-400 mt-1">{{ snapshot.dataQuality.pctWithVersion }}% of bugs</div>
        </div>
        <div class="bg-white rounded-lg shadow p-5">
          <div class="text-sm font-medium text-gray-500">Unversioned</div>
          <div class="text-3xl font-bold text-amber-600 mt-1">{{ snapshot.unversionedBugs }}</div>
          <div class="text-xs text-gray-400 mt-1">{{ (100 - snapshot.dataQuality.pctWithVersion).toFixed(1) }}% of bugs</div>
        </div>
        <div class="bg-white rounded-lg shadow p-5">
          <div class="text-sm font-medium text-gray-500">Releases Tracked</div>
          <div class="text-3xl font-bold text-gray-700 mt-1">{{ trackedReleaseCount }}</div>
          <div class="text-xs text-gray-400 mt-1">Excluding Unversioned & Pre-2.16</div>
        </div>
      </div>

      <!-- Data quality card -->
      <div class="bg-amber-50 border border-amber-200 rounded-lg p-5">
        <div class="flex items-center gap-2 mb-2">
          <svg class="h-5 w-5 text-amber-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <h3 class="text-sm font-semibold text-amber-800">Data Quality</h3>
        </div>
        <p class="text-sm text-amber-700">
          {{ snapshot.dataQuality.pctWithVersion }}% of bugs have version information
          ({{ snapshot.dataQuality.pctWithAffectsVersion }}% with Affects Version,
          {{ snapshot.dataQuality.pctWithFixVersion }}% with Fix Version).
          Setting <strong>Affects Version</strong> at triage time improves release-level reporting.
        </p>
      </div>

      <!-- Global classification breakdown -->
      <div class="bg-white rounded-lg shadow p-6">
        <h3 class="text-lg font-medium text-gray-900 mb-4">Classification Breakdown</h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div v-for="(count, category) in snapshot.global.byClassification" :key="category" class="border rounded-lg p-4" :class="categoryBorderClass(category)">
            <div class="text-sm font-medium text-gray-600">{{ categoryLabel(category) }}</div>
            <div class="text-2xl font-bold mt-1" :class="categoryTextClass(category)">{{ count }}</div>
            <div class="text-xs text-gray-400 mt-1">{{ pct(count, snapshot.totalBugs) }}%</div>
          </div>
        </div>
      </div>

      <!-- Per-release sections -->
      <div class="bg-white rounded-lg shadow p-6">
        <h3 class="text-lg font-medium text-gray-900 mb-1">By Release</h3>
        <p class="text-xs text-gray-400 mb-4">Bugs affecting multiple releases are counted in each. Per-release totals may exceed the global total.</p>

        <div class="space-y-2">
          <div v-for="release in sortedReleases" :key="release.name" class="border rounded-lg">
            <button
              @click="toggleRelease(release.name)"
              class="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
            >
              <div class="flex items-center gap-3">
                <svg
                  class="h-4 w-4 text-gray-400 transition-transform"
                  :class="{ 'rotate-90': expandedReleases[release.name] }"
                  xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
                <span class="font-medium text-gray-900">{{ release.name }}</span>
                <span v-if="release.data.eaBugs" class="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                  includes {{ release.data.eaBugs }} EA bugs
                </span>
              </div>
              <div class="flex items-center gap-4 text-sm text-gray-500">
                <span>{{ release.data.totalBugs }} bugs</span>
                <div class="flex gap-1.5">
                  <span v-if="release.data.byClassification?.regression" class="text-red-600 font-medium">{{ release.data.byClassification.regression }}R</span>
                  <span v-if="release.data.byClassification?.usability" class="text-orange-600 font-medium">{{ release.data.byClassification.usability }}U</span>
                  <span v-if="release.data.byClassification?.['general-engineering']" class="text-blue-600 font-medium">{{ release.data.byClassification['general-engineering'] }}E</span>
                </div>
              </div>
            </button>

            <!-- Expanded detail -->
            <div v-if="expandedReleases[release.name]" class="px-4 pb-4 border-t">
              <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                <div>
                  <h4 class="text-xs font-semibold text-gray-500 uppercase mb-2">Classification</h4>
                  <div v-for="(count, cat) in release.data.byClassification" :key="cat" class="flex justify-between text-sm py-0.5">
                    <span class="text-gray-600">{{ categoryLabel(cat) }}</span>
                    <span class="font-medium">{{ count }}</span>
                  </div>
                </div>
                <div>
                  <h4 class="text-xs font-semibold text-gray-500 uppercase mb-2">Priority</h4>
                  <div v-for="(count, priority) in release.data.byPriority" :key="priority" class="flex justify-between text-sm py-0.5">
                    <span class="text-gray-600">{{ priority }}</span>
                    <span class="font-medium">{{ count }}</span>
                  </div>
                </div>
                <div>
                  <h4 class="text-xs font-semibold text-gray-500 uppercase mb-2">Status</h4>
                  <div v-for="(count, status) in release.data.byStatus" :key="status" class="flex justify-between text-sm py-0.5">
                    <span class="text-gray-600">{{ status }}</span>
                    <span class="font-medium">{{ count }}</span>
                  </div>
                </div>
                <div>
                  <h4 class="text-xs font-semibold text-gray-500 uppercase mb-2">Team (Top 5)</h4>
                  <div v-for="([team, count]) in topTeams(release.data.byTeam)" :key="team" class="flex justify-between text-sm py-0.5">
                    <span class="text-gray-600 truncate mr-2">{{ team }}</span>
                    <span class="font-medium">{{ count }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Export + Generated timestamp -->
      <div class="flex items-center justify-between">
        <button
          @click="exportCsv"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
        >
          <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Export CSV
        </button>
        <div class="text-xs text-gray-400">
          Snapshot generated: {{ formatTimestamp(snapshot.generatedAt) }}
        </div>
      </div>
    </div>

    <!-- Compare sub-view -->
    <SnapshotCompare
      v-else-if="subView === 'compare' && snapshotList.length >= 2"
      :snapshotList="snapshotList"
    />
    <div v-else-if="subView === 'compare'" class="text-center py-8">
      <p class="text-gray-500">At least two snapshots are needed for comparison.</p>
    </div>

    <!-- Trends sub-view -->
    <SnapshotTrends
      v-else-if="subView === 'trends' && snapshotList.length >= 2"
      :snapshotList="snapshotList"
    />
    <div v-else-if="subView === 'trends'" class="text-center py-8">
      <p class="text-gray-500">At least two snapshots are needed to show trends.</p>
    </div>
  </div>
</template>

<script>
import { defineAsyncComponent } from 'vue';
import { getSnapshots, getSnapshot } from '../services/api';
import { exportSnapshotCsv } from '../utils/csv-export';
import SnapshotCompare from './SnapshotCompare.vue';
const SnapshotTrends = defineAsyncComponent(() => import('./SnapshotTrends.vue'));

export default {
  name: 'SnapshotView',
  components: { SnapshotCompare, SnapshotTrends },
  data() {
    return {
      snapshotList: [],
      selectedSnapshotId: null,
      snapshot: null,
      isLoading: false,
      expandedReleases: {},
      subView: 'current'
    };
  },
  computed: {
    subTabs() {
      return [
        { id: 'current', label: 'Current Snapshot' },
        { id: 'compare', label: 'Compare' },
        { id: 'trends', label: 'Trends' }
      ];
    },
    trackedReleaseCount() {
      if (!this.snapshot) return 0;
      return Object.keys(this.snapshot.releases).filter(
        r => r !== 'Unversioned' && r !== 'Pre-2.16'
      ).length;
    },
    sortedReleases() {
      if (!this.snapshot) return [];
      return Object.entries(this.snapshot.releases)
        .map(([name, data]) => ({ name, data }))
        .sort((a, b) => {
          const specialOrder = { 'Unversioned': 2, 'Pre-2.16': 1 };
          const aSpecial = specialOrder[a.name] || 0;
          const bSpecial = specialOrder[b.name] || 0;
          if (aSpecial !== bSpecial) return aSpecial - bSpecial;
          return b.name.localeCompare(a.name, undefined, { numeric: true });
        });
    }
  },
  async mounted() {
    await this.loadIndex();
  },
  methods: {
    async loadIndex() {
      this.isLoading = true;
      try {
        const data = await getSnapshots();
        this.snapshotList = data.snapshots || [];
        if (this.snapshotList.length > 0) {
          this.selectedSnapshotId = this.snapshotList[0].id;
          await this.loadSnapshot();
        }
      } catch (error) {
        console.error('Failed to load snapshot index:', error);
      } finally {
        this.isLoading = false;
      }
    },
    async loadSnapshot() {
      if (!this.selectedSnapshotId) return;
      this.isLoading = true;
      try {
        this.snapshot = await getSnapshot(this.selectedSnapshotId);
        this.expandedReleases = {};
      } catch (error) {
        console.error('Failed to load snapshot:', error);
        this.snapshot = null;
      } finally {
        this.isLoading = false;
      }
    },
    toggleRelease(name) {
      this.expandedReleases[name] = !this.expandedReleases[name];
    },
    topTeams(byTeam) {
      if (!byTeam) return [];
      return Object.entries(byTeam)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    },
    formatSnapshotLabel(id) {
      const [year, month] = id.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1);
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    },
    formatTimestamp(ts) {
      return new Date(ts).toLocaleString();
    },
    pct(value, total) {
      if (!total) return '0.0';
      return ((value / total) * 100).toFixed(1);
    },
    categoryLabel(cat) {
      const labels = {
        'regression': 'Regression',
        'usability': 'Usability',
        'general-engineering': 'General Engineering',
        'uncategorized': 'Uncategorized'
      };
      return labels[cat] || cat;
    },
    categoryBorderClass(cat) {
      const classes = {
        'regression': 'border-red-200',
        'usability': 'border-orange-200',
        'general-engineering': 'border-blue-200',
        'uncategorized': 'border-gray-200'
      };
      return classes[cat] || 'border-gray-200';
    },
    exportCsv() {
      if (this.snapshot) exportSnapshotCsv(this.snapshot);
    },
    categoryTextClass(cat) {
      const classes = {
        'regression': 'text-red-600',
        'usability': 'text-orange-600',
        'general-engineering': 'text-blue-600',
        'uncategorized': 'text-gray-600'
      };
      return classes[cat] || 'text-gray-600';
    }
  }
};
</script>
