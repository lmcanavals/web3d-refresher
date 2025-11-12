// WGSL Instancing with Storage Buffers (High-Performance)

// Define the structure for the per-object matrices (128 bytes total).
// This matches the JavaScript object stride for Storage Buffers.
struct ObjectMatrices {
    wvp: mat4x4f, // WorldViewProjection Matrix
    wit: mat4x4f, // WorldInverseTranspose Matrix
};

// -------------------------------------------------------------------------
// BINDING 0: Changed to Storage Buffer for 100 objects (Performance)
// -------------------------------------------------------------------------
// This array now holds the matrices for ALL 100 cubes.
@group(0) @binding(0) var<storage, read> objectData: array<ObjectMatrices>;

// The lighting data structure.
// NOTE: We need 16-byte alignment (vec3f is 12 bytes, so padding is required).
struct FSUniforms {
    lightDirection: vec3f,
    @size(4) _padding: u32,
};

// -------------------------------------------------------------------------
// BINDING 1: Lighting Uniform Buffer (Required alignment added)
// -------------------------------------------------------------------------
@group(0) @binding(1) var<uniform> fsUniforms: FSUniforms;
@group(0) @binding(2) var diffuseSampler: sampler;
@group(0) @binding(3) var diffuseTexture: texture_2d<f32>;


struct MyVSInput {
    @location(0) position: vec4f,
    @location(1) normal: vec3f,
    @location(2) texcoord: vec2f,
};

struct MyVSOutput {
    @builtin(position) position: vec4f,
    @location(0) normal: vec3f,
    @location(1) texcoord: vec2f,
};

// -------------------------------------------------------------------------
// VERTEX SHADER: Uses instance index to fetch the correct matrices
// -------------------------------------------------------------------------
@vertex
fn myVSMain(
    v: MyVSInput,
    @builtin(instance_index) instance_index: u32 // Fetches which cube (0-99) we are drawing
) -> MyVSOutput {
    // Fetch the correct matrix set for this instance
    let instance = objectData[instance_index];

    var vsOut: MyVSOutput;
    
    // Use the instance's WVP matrix
    vsOut.position = instance.wvp * v.position;
    
    // Use the instance's WIT matrix
    vsOut.normal = (instance.wit * vec4f(v.normal, 0.0)).xyz;

    vsOut.texcoord = v.texcoord;
    return vsOut;
}


// -------------------------------------------------------------------------
// FRAGMENT SHADER: No changes needed here, as fragment uniforms are still used
// -------------------------------------------------------------------------
@fragment
fn myFSMain(v: MyVSOutput) -> @location(0) vec4f {
    var diffuseColor = textureSample(diffuseTexture, diffuseSampler, v.texcoord);
    var a_normal = normalize(v.normal);
    
    // Note: The lightDirection is part of the fragment uniforms (Binding 1)
    var l = dot(a_normal, fsUniforms.lightDirection) * 0.5 + 0.5;

    return vec4f(diffuseColor.rgb * l, diffuseColor.a);
}
