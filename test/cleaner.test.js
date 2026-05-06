import { describe, test, expect } from '@jest/globals';
import { cleanHtml } from '../src/cleaner.js';

describe('cleanHtml', () => {
  test('extracts title and paragraph content', () => {
    const result = cleanHtml(
      '<p>This is the content of the page.</p>',
      'TestPage'
    );
    expect(result.title).toBe('TestPage');
    expect(result.content).toContain('content of the page');
  });

  test('strips infoboxes and navboxes', () => {
    const result = cleanHtml(
      '<div class="portable-infobox">Stats here</div><p>Real content.</p><div class="navbox">See also</div>',
      'Clean'
    );
    expect(result.content).toContain('Real content');
    expect(result.content).not.toContain('Stats');
    expect(result.content).not.toContain('See also');
  });

  test('strips edit section markers', () => {
    const result = cleanHtml(
      '<h2>History[edit]</h2><p>Some history.</p>',
      'Edit'
    );
    expect(result.content).toContain('## History');
    expect(result.content).not.toContain('[edit]');
  });

  test('handles headings h2-h6', () => {
    const result = cleanHtml(
      '<h2>Overview</h2><p>Content here.</p><h3>Details</h3><p>More details.</p>',
      'Headings'
    );
    expect(result.content).toContain('## Overview');
    expect(result.content).toContain('### Details');
  });

  test('extracts list items', () => {
    const result = cleanHtml(
      '<ul><li>First item</li><li>Second item</li></ul>',
      'List'
    );
    expect(result.content).toContain('- First item');
    expect(result.content).toContain('- Second item');
  });

  test('skips disambiguation pages', () => {
    const result = cleanHtml(
      '<p>This is a disambiguation page</p><div class="disambig">disambiguation notice</div>',
      'SomePage'
    );
    expect(result.content).toBe('');
  });

  test('skips List of pages', () => {
    const result = cleanHtml(
      '<p>Many things listed here</p>',
      'List of characters'
    );
    expect(result.content).toBe('');
  });

  test('handles blockquotes', () => {
    const result = cleanHtml(
      '<blockquote><p>A wise quote</p></blockquote>',
      'Quote'
    );
    expect(result.content).toContain('> A wise quote');
  });

  test('strips citation numbers', () => {
    const result = cleanHtml(
      '<p>This is a fact[1] and another[2].</p>',
      'Citations'
    );
    expect(result.content).toContain('fact');
    expect(result.content).not.toContain('[1]');
    expect(result.content).not.toContain('[2]');
  });

  test('captures bare inline text (b, i, a tags not in p)', () => {
    const result = cleanHtml(
      '<b>Bold text</b><i>Italic text</i><a href="#">Link text</a>',
      'Inline'
    );
    expect(result.content.toLowerCase()).toContain('bold text');
    expect(result.content.toLowerCase()).toContain('italic text');
    expect(result.content.toLowerCase()).toContain('link text');
  });

  test('handles tables', () => {
    const result = cleanHtml(
      '<table class="wikitable"><tr><th>Name</th><th>Value</th></tr><tr><td>Attack</td><td>100</td></tr></table>',
      'Table'
    );
    expect(result.content).toContain('| Name | Value |');
    expect(result.content).toContain('| Attack | 100 |');
  });

  test('skips very short content (under 100 chars)', () => {
    const result = cleanHtml(
      '<p>Short.</p>',
      'Stub'
    );
    expect(result.content.length).toBeLessThan(100);
  });
});
