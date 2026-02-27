import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import FilterBar from '../components/FilterBar.vue';

describe('FilterBar', () => {
  it('should render filter dropdowns', () => {
    const wrapper = mount(FilterBar, {
      props: {
        priorities: ['High', 'Medium', 'Low'],
        teams: ['Team A', 'Team B']
      }
    });

    expect(wrapper.text()).toContain('Classification');
    expect(wrapper.text()).toContain('Priority');
    expect(wrapper.text()).toContain('Team');
  });

  it('should emit filter-change event when classification changes', async () => {
    const wrapper = mount(FilterBar, {
      props: {
        priorities: [],
        teams: []
      }
    });

    const select = wrapper.findAll('select')[0];
    await select.setValue('regression');

    expect(wrapper.emitted('filter-change')).toBeTruthy();
    expect(wrapper.emitted('filter-change')[0][0]).toEqual({
      classification: 'regression',
      priority: '',
      team: '',
      dateFrom: '',
      dateTo: ''
    });
  });

  it('should clear filters when clear button is clicked', async () => {
    const wrapper = mount(FilterBar, {
      props: {
        priorities: [],
        teams: []
      }
    });

    // Set some filters
    const selects = wrapper.findAll('select');
    await selects[0].setValue('regression');
    await selects[1].setValue('High');

    // Click clear button
    const clearButton = wrapper.find('button');
    await clearButton.trigger('click');

    // Verify filters are cleared
    const emitted = wrapper.emitted('filter-change');
    const lastEmission = emitted[emitted.length - 1][0];
    expect(lastEmission.classification).toBe('');
    expect(lastEmission.priority).toBe('');
  });
});
