<template>
  <div class="bg-white rounded-lg shadow p-6">
    <h3 class="text-lg font-medium text-gray-900 mb-4">Bug Age Distribution</h3>
    <div v-if="bugs.length > 0" class="h-72">
      <Bar :data="chartData" :options="chartOptions" />
    </div>
    <div v-else class="text-center py-8 text-gray-500">
      No bug data available
    </div>
  </div>
</template>

<script>
import { Bar } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

export default {
  name: 'BugAgeChart',
  components: { Bar },
  props: {
    bugs: {
      type: Array,
      default: () => []
    }
  },
  computed: {
    ageBuckets() {
      const now = new Date()
      const buckets = {
        '< 1 week': { count: 0, regression: 0, usability: 0, engineering: 0, uncategorized: 0 },
        '1–2 weeks': { count: 0, regression: 0, usability: 0, engineering: 0, uncategorized: 0 },
        '2–4 weeks': { count: 0, regression: 0, usability: 0, engineering: 0, uncategorized: 0 },
        '1–3 months': { count: 0, regression: 0, usability: 0, engineering: 0, uncategorized: 0 },
        '3–6 months': { count: 0, regression: 0, usability: 0, engineering: 0, uncategorized: 0 },
        '6–12 months': { count: 0, regression: 0, usability: 0, engineering: 0, uncategorized: 0 },
        '> 1 year': { count: 0, regression: 0, usability: 0, engineering: 0, uncategorized: 0 }
      }

      for (const bug of this.bugs) {
        const created = new Date(bug.created)
        const ageDays = (now - created) / (1000 * 60 * 60 * 24)

        let bucket
        if (ageDays < 7) bucket = '< 1 week'
        else if (ageDays < 14) bucket = '1–2 weeks'
        else if (ageDays < 28) bucket = '2–4 weeks'
        else if (ageDays < 90) bucket = '1–3 months'
        else if (ageDays < 180) bucket = '3–6 months'
        else if (ageDays < 365) bucket = '6–12 months'
        else bucket = '> 1 year'

        buckets[bucket].count++

        const cls = bug.classification
        if (cls === 'regression') buckets[bucket].regression++
        else if (cls === 'usability') buckets[bucket].usability++
        else if (cls === 'general-engineering') buckets[bucket].engineering++
        else buckets[bucket].uncategorized++
      }

      return buckets
    },
    chartData() {
      const labels = Object.keys(this.ageBuckets)
      return {
        labels,
        datasets: [
          {
            label: 'Regression',
            data: labels.map(l => this.ageBuckets[l].regression),
            backgroundColor: 'rgba(239, 68, 68, 0.8)',
            borderRadius: 3
          },
          {
            label: 'Usability',
            data: labels.map(l => this.ageBuckets[l].usability),
            backgroundColor: 'rgba(59, 130, 246, 0.8)',
            borderRadius: 3
          },
          {
            label: 'General Engineering',
            data: labels.map(l => this.ageBuckets[l].engineering),
            backgroundColor: 'rgba(34, 197, 94, 0.8)',
            borderRadius: 3
          },
          {
            label: 'Uncategorized',
            data: labels.map(l => this.ageBuckets[l].uncategorized),
            backgroundColor: 'rgba(156, 163, 175, 0.8)',
            borderRadius: 3
          }
        ]
      }
    },
    chartOptions() {
      return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              usePointStyle: true,
              pointStyle: 'rectRounded',
              padding: 16,
              font: { size: 12 }
            }
          },
          tooltip: {
            callbacks: {
              afterBody: (items) => {
                const idx = items[0].dataIndex
                const label = Object.keys(this.ageBuckets)[idx]
                const bucket = this.ageBuckets[label]
                return `Total: ${bucket.count}`
              }
            }
          }
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            ticks: { font: { size: 11 } }
          },
          y: {
            stacked: true,
            beginAtZero: true,
            title: {
              display: true,
              text: 'Number of Bugs',
              font: { size: 12 }
            },
            ticks: {
              stepSize: 1,
              font: { size: 11 }
            }
          }
        }
      }
    }
  }
}
</script>
