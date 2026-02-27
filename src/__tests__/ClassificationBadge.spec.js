import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ClassificationBadge from '../components/ClassificationBadge.vue';

describe('ClassificationBadge', () => {
  it('should render regression badge correctly', () => {
    const wrapper = mount(ClassificationBadge, {
      props: {
        classification: 'regression',
        method: 'rule',
        reason: 'Label matched'
      }
    });

    expect(wrapper.text()).toContain('Regression');
    expect(wrapper.text()).toContain('📏');
  });

  it('should render usability badge correctly', () => {
    const wrapper = mount(ClassificationBadge, {
      props: {
        classification: 'usability',
        method: 'llm',
        reason: 'UI/UX issue detected'
      }
    });

    expect(wrapper.text()).toContain('Usability');
    expect(wrapper.text()).toContain('🤖');
  });

  it('should render general-engineering badge correctly', () => {
    const wrapper = mount(ClassificationBadge, {
      props: {
        classification: 'general-engineering',
        method: 'rule',
        reason: 'Logic error'
      }
    });

    expect(wrapper.text()).toContain('General Engineering');
  });

  it('should apply correct CSS classes for regression', () => {
    const wrapper = mount(ClassificationBadge, {
      props: {
        classification: 'regression',
        method: 'rule',
        reason: 'Test'
      }
    });

    const badge = wrapper.find('span');
    expect(badge.classes()).toContain('bg-red-100');
    expect(badge.classes()).toContain('text-red-800');
  });

  it('should apply correct CSS classes for usability', () => {
    const wrapper = mount(ClassificationBadge, {
      props: {
        classification: 'usability',
        method: 'rule',
        reason: 'Test'
      }
    });

    const badge = wrapper.find('span');
    expect(badge.classes()).toContain('bg-blue-100');
    expect(badge.classes()).toContain('text-blue-800');
  });
});
