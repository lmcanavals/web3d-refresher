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
	const gl = document.querySelector("#elCanvas").getContext("webgl2");
	if (!gl) {
		console.log("No webgl 2 for you");
		return undefined;
	}
	gl.canvas.width = gl.canvas.clientWidth;
	gl.canvas.height = gl.canvas.clientHeight;
	gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

	const program = await createProgram(gl, [
		[gl.VERTEX_SHADER, "shaders/aa_vertex.glsl"],
		[gl.FRAGMENT_SHADER, "shaders/aa_fragment.glsl"],
	]);
	const aPosition = gl.getAttribLocation(program, "a_position");
	const vertices = new Float32Array([
		0.0, 0.5, 0.,
		-0.5, -0.5, 0.,
		0.5, -0.5, 0.,
	]);
	const vertexBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

	const vertexArray = gl.createVertexArray();
	gl.bindVertexArray(vertexArray);

	gl.enableVertexAttribArray(aPosition);
	gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);

	gl.clearColor(.0, .0, .0, 0.);
	gl.clear(gl.COLOR_BUFFER_BIT);

	gl.useProgram(program);
	gl.bindVertexArray(vertexArray);
	gl.drawArrays(gl.TRIANGLES, 0, 3);
})();
