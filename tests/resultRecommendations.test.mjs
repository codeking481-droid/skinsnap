import assert from 'node:assert/strict';
import test from 'node:test';
import { getCreams, getPerfume } from '../src/resultRecommendations.ts';

test('product ideas use selected preferences and supported observation categories only', () => {
  const ideas = getCreams({}, [{ category: 'visible-blemishes' }]);
  assert.equal(ideas[0].name, 'CeraVe Blemish Control Cleanser');
  assert.equal(ideas[0].retailer, 'Boots');
  assert.match(ideas[0].priceLabel, /price varies/i);
  assert.match(ideas[0].url, /boots\.com/);
  assert.match(ideas[0].reason, /common pick.*UK/i);
  assert.match(ideas[0].reason, /check ingredients for your sensitivity/i);
  assert.match(ideas[0].reason, /not a diagnosis/i);
});

test('self-reported dry preference selects a moisture-focused UK product without generating a score', () => {
  const ideas = getCreams({ skinType: 'dry' }, []);
  assert.equal(ideas[0].name, 'The Ordinary Hyaluronic Acid 2% + B5');
  assert.match(ideas[0].reason, /not a fix/i);
  assert.equal(ideas.at(-1).name, 'La Roche-Posay Anthelios UVMune 400 SPF50+');
  assert.ok(ideas.every(idea => idea.retailer === 'Boots' && idea.url.includes('boots.com')));
});

test('fragrance-free preference suppresses vibe suggestions and user-selected mood changes the scent', () => {
  assert.deepEqual(getPerfume({ fragranceFree: 'prefer' }), []);
  assert.deepEqual(getPerfume({}), []);
  const ideas = getPerfume({}, 'Calm');
  assert.equal(ideas.length, 1);
  assert.equal(ideas[0].name, 'Glossier You');
  assert.match(ideas[0].reason, /calm-mood routine/i);
  assert.match(ideas[0].reason, /not a skin or scent-compatibility assessment/i);
  assert.match(ideas[0].reason, /clothing/i);
  assert.equal(getPerfume({}, 'Evening')[0].name, 'YSL Libre');
  assert.ok(ideas.every(idea => idea.retailer === 'Sephora UK' && idea.url.includes('sephora.co.uk')));
});
