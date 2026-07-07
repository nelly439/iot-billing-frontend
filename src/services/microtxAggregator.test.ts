import { MicrotxAggregator } from './microtxAggregator';
import fc from 'fast-check';
import BigNumber from 'bignumber.js';

describe('MicrotxAggregator', () => {
  it('should correctly sum 10,000 packets of 0.00000001 lumens', () => {
    const aggregator = new MicrotxAggregator();
    for (let i = 0; i < 10_000; i++) {
      aggregator.add('0.00000001');
    }
    const displayedTotal = aggregator.getDisplayedTotal();
    expect(displayedTotal).toBe('0.0001000');
  });

  it('should track cumulative round error across batches', () => {
    const aggregator = new MicrotxAggregator();
    // 1,000 packets of 0.00000001
    for (let i = 0; i < 1_000; i++) {
      aggregator.add('0.00000001');
    }
    aggregator.getDisplayedTotal();
    const state1 = aggregator.getState();
    expect(state1.cumulativeRoundError.toFixed(20)).not.toBe('0');

    // Another 1,000 packets
    for (let i = 0; i < 1_000; i++) {
      aggregator.add('0.00000001');
    }
    aggregator.getDisplayedTotal();
    const state2 = aggregator.getState();
    expect(state2.count).toBe(2_000);
  });

  it('property-based test: sum of 10k 1e-8 packets with error ≤ 1e-15 per packet', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('0.00000001'), { minLength: 10_000, maxLength: 10_000 }),
        (packets) => {
          const aggregator = new MicrotxAggregator();
          packets.forEach((p) => aggregator.add(p));
          const displayedTotal = aggregator.getDisplayedTotal();
          const expectedRawSum = new BigNumber(packets.length).times('0.00000001');
          const displayedTotalBN = new BigNumber(displayedTotal);
          const perPacketError = displayedTotalBN.minus(expectedRawSum).div(packets.length).abs();
          expect(perPacketError.isLessThan(1e-15)).toBe(true);
        },
      ),
    );
  });
});
