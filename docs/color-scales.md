# HeatmapComponent color scales

[**ColorScale**](../src/heatmap-component/data/color-scale.ts) constant provides useful functions for creating continuous and discrete (categorical) color scales.

## Creating continuous scales

Continuous scales map a real number from an interval to a color. Continuous scales can be created in two ways - either using an existing color scheme or creating from a custom list of colors.

```ts
ColorScale.continuous('Magma', [0, 1]); // Map numbers from interval 0-1 to colors from Magma scheme
ColorScale.continuous('YOrRd', [1, 101]); // Map numbers from interval 1-101 to colors from YOrRd scheme (Yellow-Orange-Red)
ColorScale.continuous('Blues', [0, 1], [0, 0.5]); // Map numbers from interval 0-1 to colors from the first half of Blues scheme
ColorScale.continuous('Viridis', [0, 1], [1, 0]); // Map numbers from interval 0-1 to colors from Viridis scheme in inverted order
console.log(ColorScale.ContinuousSchemes); // Print all schemes usable with ColorScale.continuous

ColorScale.continuous([0, 0.4, 1], ['#ffffff', 'orange', 'brown']); // Map 0 to white, 0.4 to orange, 1 to brown; interpolate inbetween
```

## Creating discrete scales

Discrete (categorical) scales map a value from a set (of any data type that supports comparison with ===) to a color. Discrete scales can be created in two ways - either using an existing color scheme or creating from a custom list of colors.

```ts
ColorScale.discrete('Set1', ['dog', 'cat', 'fish'], 'gray'); // Map values 'dog', 'cat', 'fish' to first three colors from Set1 scheme; any other value to gray
ColorScale.discrete('RdBu', ['Love', 'Like', 'Meh', 'Hate', 'Unacceptable!!!'], '#00000080'); // Map values 'Love', 'Like', 'Meh', 'Hate', 'Unacceptable!!!' to colors from RdBu scheme (Red-Blue); any other value to semi-transparent black
console.log(ColorScale.DiscreteSchemes); // Print all schemes usable with ColorScale.discrete

ColorScale.discrete(['dog', 'cat', 'fish'], ['red', 'green', 'blue'], 'gray'); // Map 'dog' to red, 'cat' to green, 'fish' to blue, any other value to gray
```

## Using scales

```ts
const scale = ColorScale.continuous('Magma', [0, 1]);

const color: Color = scale(0.2);
console.log(color);                 // Output: -12906640 (numeric color encoding)
console.log(Color.toString(color)); // Output: #3b0f70
console.log(Color.toRgba(color));   // Output: {r: 59, g: 15, b: 112, opacity: 1}

heatmap.setColor(scale);               // If datum type is number
heatmap.setColor(d => scale(d.score)); // If datum type is object
```

### Why use ColorScale?

Color scales created by `ColorScale` provide very similar functionality to color scales created by D3. For example, these two scales will always provide the same colors:

```ts
ColorScale.continuous('Magma', [0, 1]);
d3.scaleSequential(d3.interpolateMagma).domain([0, 1]);
```

The difference is that scales from `ColorScale` work with numeric color encoding and avoid conversions to and from string, thus achieving better performance when working with large data. (String conversions are performed when creating the scale, but not when using it.)

### Color encoding

The numeric color encoding used by Heatmap Component represents each color by a 32-bit integer (type `Color` is alias for `number`):

```
AAAAAAAARRRRRRRRGGGGGGGGBBBBBBBB
```

Top 8 bits encode alpha channel (opacity) as a number between 0 and 255, the remaining 24 bits encode red, green, and blue channel is the same manner. Conversion to and from this encoding is implemented by these functions: `Color.fromRgb(), Color.fromRgba(), Color.fromString(), Color.toRgba(), Color.toString()`.
