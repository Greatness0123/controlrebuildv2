const { mouse, screen } = require("@computer-use/nut-js");
async function check() {
    const width = await screen.width();
    const height = await screen.height();
    console.log("Nut-js screen size:", width, "x", height);
}
check();
