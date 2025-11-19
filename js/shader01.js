"use strict";

async function fetchSource(fn) {
	const resp = await fetch(fn);
	return await resp.text();
}

function loadShader(gl, type, source) {
	const shader = gl.createShader(type);
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
	if (success) {
		return shader;
	}

	console.log("Error loading shader:");
	console.log(gl.getShaderInfoLog(shader));
	gl.deleteShader(shader);
}

async function createProgram(gl, shaders) {
	const program = gl.createProgram();
	for (const [type, src] of shaders) {
		const shader = loadShader(gl, type, await fetchSource(src));
		if (shader) {
			gl.attachShader(program, shader);
		}
		// TODO: maybe end gracefully?
	}
	gl.linkProgram(program);
	const success = gl.getProgramParameter(program, gl.LINK_STATUS);
	if (success) {
		return program;
	}

	console.log(gl.getProgramInfoLog(program));
	gl.deleteProgram(program);
}

(async () => {
	const canvas = document.querySelector("#elCanvas");
	const gl = canvas.getContext("webgl2");
	if (!gl) {
		console.log("No webgl 2 for you");
		return undefined;
	}
	gl.canvas.width = gl.canvas.clientWidth;
	gl.canvas.height = gl.canvas.clientHeight;
	gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

	const program = await createProgram(gl, [
		[gl.VERTEX_SHADER, "shaders/aa_vertex.glsl"],
		[gl.FRAGMENT_SHADER, "shaders/shader01.glsl"],
	]);
	gl.useProgram(program);

	const positionLocation = gl.getAttribLocation(program, 'a_position');
	const resolutionLocation = gl.getUniformLocation(program, 'iResolution');
	const timeLocation = gl.getUniformLocation(program, 'iTime');

	const positionBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
	const positions = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
	gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

	gl.enableVertexAttribArray(positionLocation);
	gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

	let startTime = performance.now();

	function render() {
		canvas.width = window.innerWidth;
		canvas.height = window.innerHeight;
		gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);

		// Pass uniforms to the shader
		gl.uniform2f(resolutionLocation, gl.canvas.width, gl.canvas.height);
		gl.uniform1f(timeLocation, (performance.now() - startTime) / 1000);

		// Draw the full-screen quad (6 vertices = 2 triangles)
		gl.drawArrays(gl.TRIANGLES, 0, 6);

		requestAnimationFrame(render);
	}
	window.addEventListener('resize', render);
	render();
})();

