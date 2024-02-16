function main(divId) {
  const selector = "#" + divId;
  console.log("hello", selector);
  const W = 800;
  const H = 600;
  const n = 100_000;
  let i = 0;
  console.log("n:", n);
  console.time("generate data");
  const data = Array(n)
    .fill(0)
    .map(() => [Math.random() * W, Math.random() * H, i++]);
  console.timeEnd("generate data");
  const svg = d3
    .select(selector)
    .append("svg")
    .attr("width", W)
    .attr("height", H)
    .style("border", "1px solid black");
  const DEFAULT_COLOR = "#ddaabb";
  const HIGHTLIGHT_COLOR = "#880066";
  console.time("create rects");
  const rects = svg
    .selectAll("rect")
    .data(data)
    .enter()
    .append("rect")
    .attr("id", (d) => "rect" + d[2])
    .attr("x", (d) => d[0])
    .attr("y", (d) => d[1])
    .attr("width", 8)
    .attr("height", 8)
    .attr("stroke", "black")
    .attr("fill", DEFAULT_COLOR);
  console.timeEnd("create rects");
  console.time("set events");
  rects.on("mouseover", (e, d) => {
    // console.log(e.offsetX, e.offsetY, d, e);
    svg.selectAll("#rect" + d[2]).attr("fill", HIGHTLIGHT_COLOR);
  });
  console.timeEnd("set events");
}
