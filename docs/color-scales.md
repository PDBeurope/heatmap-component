TODO:

const colorScale = createColorScale('YlOrRd', [0, 1], [0, 1]);
d3.scaleSequential(d3.interpolateYlOrRd).domain([0, 1])


const colorScale = createColorScale([0, 0.5, 1], ['#eeeeee', 'gold', 'red']); // no simple d3 counterpart methinks
