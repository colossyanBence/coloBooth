const s_gui_prop = {
    srcimg_scale: 1.0,
    flip_horizontal: true,
}
let s_srctex_region;
let s_masktex_region;

function calc_size_to_fit (src_w, src_h, win_w, win_h) {
    let win_aspect = win_w / win_h;
    let tex_aspect = src_w / src_h;
    let scale;
    let scaled_w, scaled_h;
    let offset_x, offset_y;

    if (win_aspect > tex_aspect)
    {
        scale = win_h / src_h;
        scaled_w = scale * src_w;
        scaled_h = scale * src_h;
        offset_x = (win_w - scaled_w) * 0.5;
        offset_y = 0;
    }
    else
    {
        scale = win_w / src_w;
        scaled_w = scale * src_w;
        scaled_h = scale * src_h;
        offset_x = 0;
        offset_y = (win_h - scaled_h) * 0.5;
    }

    let region = {
        width  : win_w,     /* full rect width  with margin */
        height : win_h,     /* full rect height with margin */
        tex_x  : offset_x,  /* start position of valid texture */
        tex_y  : offset_y,  /* start position of valid texture */
        tex_w  : scaled_w,  /* width  of valid texture */
        tex_h  : scaled_h,  /* height of valid texture */
        scale  : scale,
    }
    return region;
}


function render_2d_scene (gl, texid, face_predictions, tex_w, tex_h, masktex, mask_predictions) {
    let color = [0.0, 1.0, 1.0, 0.5]
    let radius = 5;
    let tx = s_srctex_region.tex_x;
    let ty = s_srctex_region.tex_y;
    let tw = s_srctex_region.tex_w;
    let th = s_srctex_region.tex_h;
    let scale = s_srctex_region.scale;
    let flip_h = s_gui_prop.flip_horizontal;

    gl.disable (gl.DEPTH_TEST);

    let flip = flip_h ? r2d.FLIP_H : 0
    r2d.draw_2d_texture (gl, texid, tx, ty, tw, th, flip)

    let mask_color = [1.0, 1.0, 1.0, 0.7];

    for (let i = 0; i < face_predictions.length; i++){
        const keypoints = face_predictions[i].scaledMesh;

        /* render the deformed mask image onto the camera image */
        if (mask_predictions.length > 0){
            const mask_keypoints = mask_predictions[0].scaledMesh;

            let face_vtx = new Array(keypoints.length * 3);
            let face_uv  = new Array(keypoints.length * 2);
            for (let i = 0; i < keypoints.length; i++)
            {
                let p = keypoints[i];
                face_vtx[3 * i + 0] = p[0] * scale + tx;
                face_vtx[3 * i + 1] = p[1] * scale + ty;
                face_vtx[3 * i + 2] = p[2];

                let q = mask_keypoints[i];
                face_uv [2 * i + 0] = q[0] / masktex.image.width;
                face_uv [2 * i + 1] = q[1] / masktex.image.height;

                if (flip_h){
                    face_vtx[3 * i + 0] = (tex_w - p[0]) * scale + tx;
                }
            }

            draw_facemesh_tri_tex (gl, masktex.texid, face_vtx, face_uv, mask_color, true, flip_h); // CUT EYE HOLES 6th param
        }
    }

    /* render 2D mask image */
    if (mask_predictions.length > 0){
        let texid = masktex.texid;
        let tx = 5;
        let ty = 60;
        let tw = s_masktex_region.tex_w * s_gui_prop.srcimg_scale;
        let th = s_masktex_region.tex_h * s_gui_prop.srcimg_scale;
        let radius = 2;
        r2d.draw_2d_texture (gl, texid, tx, ty, tw, th, 0);
        r2d.draw_2d_rect (gl, tx, ty, tw, th, [1.0, 1.0, 1.0, 1.0], 3.0);

        // const mask_keypoints = mask_predictions[0].scaledMesh;
        // for (let i = 0; i < mask_keypoints.length; i++){
        //     let p = mask_keypoints[i];
        //     x = p[0] / masktex.image.width  * tw + tx;
        //     y = p[1] / masktex.image.height * th + ty;
        //     r2d.draw_2d_fillrect (gl, x - radius/2, y - radius/2, radius,  radius, color);
        // }
    }
}

function startWebGL() {
    let current_phase = 0;

    const canvas = document.querySelector('#glcanvas');
    const gl = canvas.getContext('webgl', {preserveDrawingBuffer: true});

    gl.clearColor (0.7, 0.7, 0.7, 1.0);
    gl.clear (gl.COLOR_BUFFER_BIT);
    const camtex = GLUtil.create_camera_texture(gl);

    let masktex = GLUtil.create_image_texture2(gl, "./face-ryan.png");
    // let masktex = GLUtil.create_image_texture2(gl, "./face-harold.png");
    // let masktex = GLUtil.create_image_texture2(gl, "./face-domi.png");
    // let masktex = GLUtil.create_image_texture2(gl, "./face-luke.png");
    // let masktex = GLUtil.create_image_texture2(gl, "./face-nina.png");
    // let masktex = GLUtil.create_image_texture2(gl, "./face-lisa.png");
    let mask_predictions = {length: 0};
    let mask_init_done = false;

    let win_w = canvas.clientWidth;
    let win_h = canvas.clientHeight;

    r2d.init_2d_render (gl, win_w, win_h);
    init_facemesh_render (gl, win_w, win_h);

    /* --------------------------------- *
     *  load FACEMESH
     * --------------------------------- */
    let facemesh_ready = false;
    let facemesh_model;
    {
        faceLandmarksDetection
            .load(faceLandmarksDetection.SupportedPackages.mediapipeFacemesh)
            .then((model)=>{
                facemesh_ready = true;
                facemesh_model = model;
            });
    }

    current_phase = 1;

    async function render (now){
        win_w = canvas.width;
        win_h = canvas.height;


        /* --------------------------------------- *
         *  Update Mask (if need)
         * --------------------------------------- */
        let mask_updated = false;
        if (facemesh_ready){
            if (mask_init_done == false){
                for (let i = 0; i < 5; i ++) {
                    mask_predictions = await facemesh_model.estimateFaces ({input: masktex.image});
                }
                mask_init_done = true;
                s_masktex_region = calc_size_to_fit (masktex.image.width, masktex.image.height, 150, 150);
                mask_updated = true;
            }
            gl.bindFramebuffer (gl.FRAMEBUFFER, null);
            gl.viewport (0, 0, win_w, win_h);
            gl.scissor  (0, 0, win_w, win_h);
        }


        let src_w;
        let src_h;
        let texid;
        if (GLUtil.is_camera_ready(camtex)) {
            GLUtil.update_camera_texture (gl, camtex);
            src_w = camtex.video.videoWidth;
            src_h = camtex.video.videoHeight;
            texid = camtex.texid;
        }

        /* --------------------------------------- *
         *  invoke TF.js (Facemesh)
         * --------------------------------------- */
        s_srctex_region = calc_size_to_fit (src_w, src_h, win_w, win_h);
        let face_predictions = {length: 0};

        if (facemesh_ready && GLUtil.is_camera_ready(camtex)){
            current_phase = 2;

            num_repeat = mask_updated ? 2 : 1;
            for (let i = 0; i < num_repeat; i++){
                face_predictions = await facemesh_model.estimateFaces ({input: camtex.video});
            }
        }

        /* --------------------------------------- *
         *  render scene
         * --------------------------------------- */
        
        // TODO: I commented the clear out, ugly hack not to clear canvas so I can take a screenshot in a wrong way instead of getting it through the render function
        //gl.clear (gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        render_2d_scene (gl, texid, face_predictions, src_w, src_h, masktex, mask_predictions);
        requestAnimationFrame (render);
    }
    render();
}
