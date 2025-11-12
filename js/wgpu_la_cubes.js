"use strict";

import {
	mat4,
	vec3,
} from 'https://wgpu-matrix.org/dist/3.x/wgpu-matrix.module.js';

(async () => {
	const adapter = await navigator.gpu?.requestAdapter();
	const device = await adapter?.requestDevice();
	if (!device) {
		console.log("No WebGPU for you today.");
		return;
	}

	const canvas = document.querySelector('#elCanvas');
	const context = canvas.getContext('webgpu');

	const presentationFormat = navigator.gpu.getPreferredCanvasFormat(adapter);
	context.configure({ device, format: presentationFormat });

	const canvasInfo = {
		canvas, context, presentationFormat,
		// OPTIMIZATION: sampleCount is 1 (MSAA disabled)
		sampleCount: 1,
		depthTexture: undefined,
		depthTextureView: undefined,
	};

	async function fetchSource(fn) {
		const resp = await fetch(fn);
		return await resp.text();
	}

	function createBuffer(device, data, usage) {
		const buffer = device.createBuffer({
			size: data.byteLength,
			usage,
			mappedAtCreation: true,
		});
		const dst = new data.constructor(buffer.getMappedRange());
		dst.set(data);
		buffer.unmap();
		return buffer;
	}

	const shaderSrc = await fetchSource('shaders/la_cubes.wgsl');

	const positions = new Float32Array([
		1, 1, -1, 1, 1, 1, 1, -1, 1, 1, -1, -1,
		-1, 1, 1, -1, 1, -1, -1, -1, -1, -1, -1, 1,
		-1, 1, 1, 1, 1, 1, 1, 1, -1, -1, 1, -1,
		-1, -1, -1, 1, -1, -1, 1, -1, 1, -1, -1, 1,
		1, 1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1,
		-1, 1, -1, 1, 1, -1, 1, -1, -1, -1, -1, -1
	]);
	const normals = new Float32Array([
		1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
		-1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
		0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
		0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
		0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
		0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1
	]);
	const texcoords = new Float32Array([
		1, 0, 0, 0, 0, 1, 1, 1,
		1, 0, 0, 0, 0, 1, 1, 1,
		1, 0, 0, 0, 0, 1, 1, 1,
		1, 0, 0, 0, 0, 1, 1, 1,
		1, 0, 0, 0, 0, 1, 1, 1,
		1, 0, 0, 0, 0, 1, 1, 1
	]);
	const indices = new Uint16Array([
		0, 1, 2, 0, 2, 3,
		4, 5, 6, 4, 6, 7,
		8, 9, 10, 8, 10, 11,
		12, 13, 14, 12, 14, 15,
		16, 17, 18, 16, 18, 19,
		20, 21, 22, 20, 22, 23
	]);

	const positionBuffer = createBuffer(device, positions, GPUBufferUsage.VERTEX);
	const normalBuffer = createBuffer(device, normals, GPUBufferUsage.VERTEX);
	const texcoordBuffer = createBuffer(device, texcoords, GPUBufferUsage.VERTEX);
	const indicesBuffer = createBuffer(device, indices, GPUBufferUsage.INDEX);

	const tex = device.createTexture({
		size: [2, 2],
		format: 'rgba8unorm',
		usage:
			GPUTextureUsage.TEXTURE_BINDING |
			GPUTextureUsage.COPY_DST,
	});
	device.queue.writeTexture(
		{ texture: tex },
		new Uint8Array([
			140, 228, 255, 10,
			254, 238, 145, 10,
			255, 162, 57, 10,
			255, 86, 86, 10,
		]),
		{ bytesPerRow: 8, rowsPerImage: 2 },
		{ width: 2, height: 2 },
	);

	const sampler = device.createSampler({
		magFilter: 'nearest',
		minFilter: 'nearest',
	});

	const shaderModule = device.createShaderModule({ code: shaderSrc });

	const pipeline = device.createRenderPipeline({
		label: 'fake lighting',
		layout: 'auto',
		vertex: {
			module: shaderModule,
			buffers: [
				{ arrayStride: 3 * 4, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] },
				{ arrayStride: 3 * 4, attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x3' }] },
				{ arrayStride: 2 * 4, attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x2', }] },
			],
		},
		fragment: {
			module: shaderModule,
			targets: [{ format: presentationFormat }],
		},
		primitive: { topology: 'triangle-list', cullMode: 'back' },
		depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: 'depth24plus' },
	});

	// --- OPTIMIZED MATRIX BUFFER SETUP (Storage Buffer) ---
	const numObjects = 100;
	const objectStrideBytes = 2 * 16 * 4; // 128 bytes per object
	const objectStrideFloats = 2 * 16; // 32 floats per object
	const allObjectsUniformBufferSize = numObjects * objectStrideBytes;

	const allObjectsStorageBuffer = device.createBuffer({
		size: allObjectsUniformBufferSize,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
	});

	const allObjectsUniformValues = new Float32Array(numObjects * objectStrideFloats);

	const objectInfos = [];
	const across = Math.sqrt(numObjects);
	for (let i = 0; i < numObjects; ++i) {
		const offset = i * objectStrideFloats;

		objectInfos.push({
			worldViewProjection: allObjectsUniformValues.subarray(offset, offset + 16),
			worldInverseTranspose: allObjectsUniformValues.subarray(offset + 16, offset + 32),
			translation: [
				(i % across - (across - 1) / 2) * 3,
				((i / across | 0) - (across - 1) / 2) * 3,
				0
			],
		});
	}
	// -------------------------------------------------------------------

	const fUniformBufferSize = 3 * 4;
	const fsUniformBuffer = device.createBuffer({
		size: Math.max(16, fUniformBufferSize),
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	});
	const fsUniformValues = new Float32Array(3);
	const lightDirection = fsUniformValues.subarray(0, 3);

	// Create ONE Bind Group for ALL objects
	const bindGroup = device.createBindGroup({
		layout: pipeline.getBindGroupLayout(0),
		entries: [
			{
				binding: 0,
				resource: {
					buffer: allObjectsStorageBuffer,
					size: allObjectsUniformBufferSize
				}
			},
			// Binding 1: Fragment uniforms (Lighting)
			{ binding: 1, resource: { buffer: fsUniformBuffer } },
			// Binding 2: Sampler
			{ binding: 2, resource: sampler },
			// Binding 3: Texture
			{ binding: 3, resource: tex.createView() },
		],
	});

	const renderPassDescriptor = {
		colorAttachments: [
			{
				view: undefined,
				clearValue: [0., 0., 0., 0.],
				loadOp: 'clear',
				storeOp: 'store',
			},
		],
		depthStencilAttachment: {
			view: undefined,
			depthClearValue: 1,
			depthLoadOp: 'clear',
			depthStoreOp: 'store',
		},
	};

	function resizeToDisplaySize(device, canvasInfo) {
		const { canvas, depthTexture } = canvasInfo;
		const width = Math.max(1, Math.min(device.limits.maxTextureDimension2D, canvas.clientWidth));
		const height = Math.max(1, Math.min(device.limits.maxTextureDimension2D, canvas.clientHeight));

		const needResize = !canvasInfo.depthTexture ||
			width !== canvas.width ||
			height !== canvas.height;

		if (needResize) {
			if (depthTexture) {
				depthTexture.destroy();
			}

			canvas.width = width;
			canvas.height = height;

			const newDepthTexture = device.createTexture({
				size: [canvas.width, canvas.height],
				format: 'depth24plus',
				sampleCount: canvasInfo.sampleCount,
				usage: GPUTextureUsage.RENDER_ATTACHMENT,
			});
			canvasInfo.depthTexture = newDepthTexture;
			canvasInfo.depthTextureView = newDepthTexture.createView();
		}
		return needResize;
	}

	function render(time) {
		time *= 0.001;
		resizeToDisplaySize(device, canvasInfo);

		const colorTexture = context.getCurrentTexture();
		renderPassDescriptor.colorAttachments[0].view = colorTexture.createView();
		renderPassDescriptor.depthStencilAttachment.view = canvasInfo.depthTextureView;

		const commandEncoder = device.createCommandEncoder();
		const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);

		passEncoder.setPipeline(pipeline);
		passEncoder.setVertexBuffer(0, positionBuffer);
		passEncoder.setVertexBuffer(1, normalBuffer);
		passEncoder.setVertexBuffer(2, texcoordBuffer);
		passEncoder.setIndexBuffer(indicesBuffer, 'uint16');

		passEncoder.setBindGroup(0, bindGroup);

		const projection = mat4.perspective(30 * Math.PI / 180, canvas.clientWidth / canvas.clientHeight, 0.5, 100);
		const eye = [1, 4, -46];
		const target = [0, 0, 0];
		const up = [0, 1, 0];

		const view = mat4.lookAt(eye, target, up);
		const viewProjection = mat4.multiply(projection, view);

		vec3.normalize([1, 8, -10], lightDirection);
		device.queue.writeBuffer(fsUniformBuffer, 0, fsUniformValues);

		// Calculate matrices and write to the SINGLE large array
		objectInfos.forEach(({
			worldViewProjection,
			worldInverseTranspose,
			translation,
		}, ndx) => {
			const world = mat4.translation(translation);
			mat4.rotateX(world, time * 0.9 + ndx, world);
			mat4.rotateY(world, time + ndx, world);
			mat4.transpose(mat4.inverse(world), worldInverseTranspose);
			mat4.multiply(viewProjection, world, worldViewProjection);
		});

		// ONE single write buffer call for all 100 objects!
		device.queue.writeBuffer(allObjectsStorageBuffer, 0, allObjectsUniformValues);

		// Draw 100 instances
		passEncoder.drawIndexed(indices.length, numObjects);

		passEncoder.end();
		device.queue.submit([commandEncoder.finish()]);

		requestAnimationFrame(render);
	}
	requestAnimationFrame(render);
})();
