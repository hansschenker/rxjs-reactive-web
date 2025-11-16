import { bind } from '../src/bind';
import { BehaviorSubject, of } from 'rxjs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('bind', () => {
  let container: HTMLElement;
  
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('should bind text content', () => {
    const text$ = new BehaviorSubject('Hello');
    container.innerHTML = '<div class="test">Initial</div>';
    
    const binding = bind(container, {
      text: { '.test': text$ }
    });
    
    expect(container.querySelector('.test')?.textContent).toBe('Hello');
    text$.next('Updated');
    expect(container.querySelector('.test')?.textContent).toBe('Updated');
    
    binding.subscription.unsubscribe();
  });

  it('should handle events', () => {
    let clickCount = 0;
    container.innerHTML = '<button data-on="click">Click me</button>';
    
    const binding = bind(container, {
      events: { 'click': () => clickCount++ }
    });
    
    container.querySelector('button')?.click();
    expect(clickCount).toBe(1);
    
    binding.subscription.unsubscribe();
  });
});
