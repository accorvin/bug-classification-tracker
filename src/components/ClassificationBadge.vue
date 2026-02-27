<template>
  <div class="inline-flex items-center gap-1.5">
    <span
      class="px-2 py-1 rounded-md text-xs font-medium"
      :class="badgeClass"
      :title="reason"
    >
      {{ badgeText }}
    </span>
    <span :title="methodTooltip" class="text-sm">
      {{ methodIcon }}
    </span>
  </div>
</template>

<script>
export default {
  name: 'ClassificationBadge',
  props: {
    classification: {
      type: String,
      required: true
    },
    method: {
      type: String,
      required: true,
      validator: (value) => ['rule', 'llm'].includes(value)
    },
    reason: {
      type: String,
      default: ''
    }
  },
  computed: {
    badgeClass() {
      const classes = {
        'regression': 'bg-red-100 text-red-800',
        'usability': 'bg-blue-100 text-blue-800',
        'general-engineering': 'bg-green-100 text-green-800',
        'uncategorized': 'bg-gray-100 text-gray-800'
      };
      return classes[this.classification] || classes.uncategorized;
    },
    badgeText() {
      const labels = {
        'regression': 'Regression',
        'usability': 'Usability',
        'general-engineering': 'General Engineering',
        'uncategorized': 'Uncategorized'
      };
      return labels[this.classification] || 'Unknown';
    },
    methodIcon() {
      return this.method === 'llm' ? '🤖' : '📏';
    },
    methodTooltip() {
      return this.method === 'llm' ? 'Classified by LLM' : 'Classified by rule';
    }
  }
}
</script>
