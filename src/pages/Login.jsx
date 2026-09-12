import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase/config";
import { useNavigate } from "react-router-dom";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, useAnimations, useGLTF } from "@react-three/drei";
import * as THREE from "three";

const MODEL_URL = "/internal-os/models/human.glb";

/* ========================================================================= */
/* BOSS MODEL                                                               */
/* ========================================================================= */

function BossModel({ mouse }) {
  const group = useRef(null);
  const character = useRef(null);

  const { size } = useThree();
  const { scene, animations } = useGLTF(MODEL_URL);
  const { actions } = useAnimations(animations, group);

  const [modelTransform, setModelTransform] = useState({
    scale: 1,
    x: 0,
    y: 0,
    z: 0,
  });

  /* ----------------------------------------------------------------------- */
  /* MODEL SETUP                                                             */
  /* ----------------------------------------------------------------------- */

  useEffect(() => {
    if (!scene) return;

    scene.traverse((object) => {
      if (object.isMesh) {
        object.frustumCulled = false;

        if (object.material) {
          object.material.needsUpdate = true;
        }
      }
    });

    scene.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(scene);
    const dimensions = new THREE.Vector3();
    const center = new THREE.Vector3();

    box.getSize(dimensions);
    box.getCenter(center);

    /*
      Desktop:
        smaller than the previous version.

      Mobile:
        considerably smaller so the Boss does not swallow the
        entire creative panel.
    */
    const isMobile = size.width < 768;

    const targetHeight = isMobile ? 2.65 : 3.65;

    const scale =
      targetHeight / Math.max(dimensions.y, 0.001);

    setModelTransform({
      scale,
      x: -center.x * scale,
      y: -box.min.y * scale - (isMobile ? 1.08 : 1.62),
      z: -center.z * scale,
    });
  }, [scene, size.width]);

  /* ----------------------------------------------------------------------- */
  /* ANIMATION                                                               */
  /* ----------------------------------------------------------------------- */

  useEffect(() => {
    if (!actions) return;

    const names = Object.keys(actions);

    if (!names.length) return;

    const preferred =
      names.find((name) =>
        /idle|stand|breath|relax/i.test(name)
      ) || names[0];

    const action = actions[preferred];

    if (!action) return;

    action.reset();
    action.setEffectiveWeight(1);
    action.setEffectiveTimeScale(1);
    action.fadeIn(0.35);
    action.play();

    return () => {
      action.fadeOut(0.2);
    };
  }, [actions]);

  /* ----------------------------------------------------------------------- */
  /* MOUSE / POINTER RESPONSE                                                */
  /* ----------------------------------------------------------------------- */

  useFrame((state, delta) => {
    if (!group.current) return;

    const time = state.clock.elapsedTime;

    /*
      STRONG FULL-SCREEN RESPONSE

      The previous version mainly reacted when the cursor was
      over the left panel.

      Now the pointer values come from the whole browser window,
      so moving across the right login panel also moves the Boss.
    */

    const targetRotationY = mouse.x * 0.62;
    const targetRotationX = mouse.y * -0.20;

    group.current.rotation.y = THREE.MathUtils.damp(
      group.current.rotation.y,
      targetRotationY,
      5.8,
      delta
    );

    group.current.rotation.x = THREE.MathUtils.damp(
      group.current.rotation.x,
      targetRotationX,
      5.5,
      delta
    );

    /*
      Much stronger horizontal parallax.
    */
    const targetX = mouse.x * 0.68;

    group.current.position.x = THREE.MathUtils.damp(
      group.current.position.x,
      targetX,
      5.5,
      delta
    );

    /*
      Vertical cursor movement.
    */
    const targetZ = mouse.y * 0.28;

    group.current.position.z = THREE.MathUtils.damp(
      group.current.position.z,
      targetZ,
      5,
      delta
    );

    /*
      Natural idle floating.
    */
    const idleFloat =
      Math.sin(time * 0.9) * 0.018 +
      Math.sin(time * 0.43) * 0.012;

    group.current.position.y = THREE.MathUtils.damp(
      group.current.position.y,
      idleFloat,
      3.8,
      delta
    );

    /*
      Body sway follows pointer.
    */
    if (character.current) {
      const bodyRotationZ =
        mouse.x * 0.08 +
        Math.sin(time * 0.65) * 0.012;

      character.current.rotation.z = THREE.MathUtils.damp(
        character.current.rotation.z,
        bodyRotationZ,
        4.5,
        delta
      );

      const bodyRotationX =
        mouse.y * -0.045;

      character.current.rotation.x = THREE.MathUtils.damp(
        character.current.rotation.x,
        bodyRotationX,
        4.5,
        delta
      );
    }
  });

  return (
    <group ref={group}>
      <group
        ref={character}
        position={[
          modelTransform.x,
          modelTransform.y,
          modelTransform.z,
        ]}
        scale={[
          modelTransform.scale,
          modelTransform.scale,
          modelTransform.scale,
        ]}
      >
        <primitive object={scene} />
      </group>
    </group>
  );
}

useGLTF.preload(MODEL_URL);

/* ========================================================================= */
/* BOSS SCENE                                                               */
/* ========================================================================= */

function BossScene({ mouse }) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{
        position: [0, 1.1, 7.4],
        fov: 31,
        near: 0.1,
        far: 100,
      }}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
      }}
      style={{
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    >
      <ambientLight intensity={1.5} />

      <directionalLight
        position={[4, 7, 6]}
        intensity={2.25}
      />

      <directionalLight
        position={[-5, 3, 4]}
        intensity={1.25}
      />

      <pointLight
        position={[0, 2.5, 3]}
        intensity={1.8}
        distance={9}
      />

      <pointLight
        position={[-3, 1, -2]}
        intensity={0.75}
        distance={7}
      />

      <Suspense fallback={null}>
        <BossModel mouse={mouse} />

        <Environment
          preset="studio"
          environmentIntensity={0.65}
        />
      </Suspense>
    </Canvas>
  );
}

/* ========================================================================= */
/* PRODUCTION CARD                                                           */
/* ========================================================================= */

function ProductionCard({
  number,
  eyebrow,
  title,
  className = "",
  style,
}) {
  return (
    <div
      className={`
        pointer-events-none
        absolute
        z-40
        w-[132px]
        rounded-[16px]
        border
        border-white/[0.13]
        bg-[#171918]/90
        p-3.5
        shadow-[0_18px_50px_rgba(0,0,0,0.4)]
        backdrop-blur-xl
        transition-transform
        duration-300
        ease-out
        sm:w-[140px]
        sm:p-4
        ${className}
      `}
      style={style}
    >
      <div className="flex items-center justify-between">
        <span className="text-[8px] font-medium tracking-[0.16em] text-white/35">
          {number}
        </span>

        <span className="h-1.5 w-1.5 rounded-full bg-[#ffad5b] shadow-[0_0_12px_rgba(255,173,91,0.85)]" />
      </div>

      <div className="mt-3 text-[7px] font-medium uppercase tracking-[0.22em] text-[#d69b61]">
        {eyebrow}
      </div>

      <div className="mt-1.5 text-[14px] font-medium tracking-tight text-white">
        {title}
      </div>

      <div className="mt-3.5 h-px w-full bg-white/10">
        <div className="h-px w-[58%] bg-[#d69b61]" />
      </div>
    </div>
  );
}

/* ========================================================================= */
/* LOGIN                                                                    */
/* ========================================================================= */

function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [mouse, setMouse] = useState({
    x: 0,
    y: 0,
  });

  /* ----------------------------------------------------------------------- */
  /* GLOBAL POINTER TRACKING                                                 */
  /* ----------------------------------------------------------------------- */

  useEffect(() => {
    let animationFrame = null;

    const handlePointerMove = (event) => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }

      animationFrame = requestAnimationFrame(() => {
        const width = window.innerWidth;
        const height = window.innerHeight;

        /*
          Normalize the pointer across the ENTIRE browser window.

          -1 = far left
          +1 = far right
        */
        const normalizedX =
          (event.clientX / width) * 2 - 1;

        const normalizedY =
          (event.clientY / height) * 2 - 1;

        setMouse({
          x: THREE.MathUtils.clamp(
            normalizedX,
            -1,
            1
          ),
          y: THREE.MathUtils.clamp(
            normalizedY,
            -1,
            1
          ),
        });
      });
    };

    const handlePointerLeave = () => {
      setMouse({
        x: 0,
        y: 0,
      });
    };

    window.addEventListener(
      "pointermove",
      handlePointerMove,
      { passive: true }
    );

    window.addEventListener(
      "pointerleave",
      handlePointerLeave
    );

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }

      window.removeEventListener(
        "pointermove",
        handlePointerMove
      );

      window.removeEventListener(
        "pointerleave",
        handlePointerLeave
      );
    };
  }, []);

  /* ----------------------------------------------------------------------- */
  /* EXISTING LOGIN LOGIC — UNCHANGED                                        */
  /* ----------------------------------------------------------------------- */

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");

    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }

    try {
      setLoading(true);

      await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      navigate("/");
    } catch (error) {
      console.error("Login error:", error);

      setError("Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  /* ----------------------------------------------------------------------- */
  /* CARD PARALLAX                                                           */
  /* ----------------------------------------------------------------------- */

  const cardMotion = useMemo(
    () => ({
      brief: {
        transform: `
          translate3d(
            ${mouse.x * 13}px,
            ${mouse.y * 9}px,
            0
          )
          rotate(-7deg)
        `,
      },

      shoot: {
        transform: `
          translate3d(
            ${mouse.x * -13}px,
            ${mouse.y * 10}px,
            0
          )
          rotate(6deg)
        `,
      },

      edit: {
        transform: `
          translate3d(
            ${mouse.x * 16}px,
            ${mouse.y * -9}px,
            0
          )
          rotate(7deg)
        `,
      },

      review: {
        transform: `
          translate3d(
            ${mouse.x * -14}px,
            ${mouse.y * -9}px,
            0
          )
          rotate(-5deg)
        `,
      },
    }),
    [mouse]
  );

  return (
    <main
      className="
        fixed
        inset-0
        h-[100dvh]
        w-full
        overflow-hidden
        bg-[#0a0b0b]
      "
    >
      <div
        className="
          flex
          h-full
          w-full
          flex-col
          lg:flex-row
        "
      >

        {/* =============================================================== */}
        {/* LEFT CREATIVE SIDE                                               */}
        {/* =============================================================== */}

        <section
          className="
            relative
            h-[43%]
            w-full
            shrink-0
            overflow-hidden
            bg-[#090a0a]
            lg:h-full
            lg:w-[58%]
          "
        >
          {/* Grid */}
          <div
            className="
              pointer-events-none
              absolute
              inset-0
              opacity-[0.14]
            "
            style={{
              backgroundImage: `
                linear-gradient(
                  rgba(255,255,255,0.08) 1px,
                  transparent 1px
                ),
                linear-gradient(
                  90deg,
                  rgba(255,255,255,0.08) 1px,
                  transparent 1px
                )
              `,
              backgroundSize: "42px 42px",
            }}
          />

          {/* Orange glow */}
          <div
            className="
              pointer-events-none
              absolute
              left-[45%]
              top-[54%]
              h-[380px]
              w-[380px]
              -translate-x-1/2
              -translate-y-1/2
              rounded-full
              bg-[#c76b29]/20
              blur-[100px]
              lg:h-[500px]
              lg:w-[500px]
            "
          />

          {/* Green glow */}
          <div
            className="
              pointer-events-none
              absolute
              bottom-[-170px]
              left-[-100px]
              h-[320px]
              w-[320px]
              rounded-full
              bg-[#145447]/20
              blur-[100px]
            "
          />

          {/* Orbit */}
          <div
            className="
              pointer-events-none
              absolute
              left-[8%]
              top-[18%]
              h-[420px]
              w-[420px]
              rounded-full
              border
              border-white/[0.05]
              lg:left-[4%]
              lg:top-[12%]
              lg:h-[680px]
              lg:w-[680px]
            "
          />

          <div
            className="
              pointer-events-none
              absolute
              left-[18%]
              top-[29%]
              h-[290px]
              w-[290px]
              rounded-full
              border
              border-white/[0.035]
              lg:left-[14%]
              lg:top-[23%]
              lg:h-[470px]
              lg:w-[470px]
            "
          />

          {/* ============================================================= */}
          {/* BRAND                                                          */}
          {/* ============================================================= */}

          <div
            className="
              absolute
              left-5
              top-4
              z-50
              flex
              items-center
              gap-2.5
              lg:left-12
              lg:top-9
            "
          >
            <div
              className="
                flex
                h-8
                w-8
                items-center
                justify-center
                rounded-[10px]
                border
                border-white/15
                bg-white/[0.045]
                text-[9px]
                font-semibold
                text-white
                lg:h-11
                lg:w-11
                lg:rounded-[14px]
                lg:text-[13px]
              "
            >
              RF
            </div>

            <div>
              <div className="text-[9px] font-semibold tracking-[0.25em] text-white lg:text-[13px] lg:tracking-[0.27em]">
                RARE FICTION
              </div>

              <div className="mt-0.5 text-[6px] tracking-[0.3em] text-white/35 lg:mt-1 lg:text-[9px]">
                MEDIA
              </div>
            </div>
          </div>

          {/* ============================================================= */}
          {/* CREATIVE TITLE                                                 */}
          {/* ============================================================= */}

          <div
            className="
              absolute
              left-5
              top-[74px]
              z-40
              lg:left-12
              lg:top-[128px]
            "
          >
            <div className="mb-2.5 flex items-center gap-2 lg:mb-5 lg:gap-3">
              <span className="h-px w-5 bg-[#e5a05c] lg:w-9" />

              <span className="text-[6px] font-medium uppercase tracking-[0.27em] text-[#e5a05c] lg:text-[9px] lg:tracking-[0.31em]">
                Creative operations
              </span>
            </div>

            <h1
              className="
                select-none
                text-[30px]
                font-semibold
                leading-[0.86]
                tracking-[-0.06em]
                text-white
                sm:text-[42px]
                lg:text-[76px]
                xl:text-[88px]
              "
            >
              <span className="block">
                Create.
              </span>

              <span className="block text-white/85">
                Collaborate.
              </span>

              <span className="block text-[#ffad5b]">
                Deliver.
              </span>
            </h1>
          </div>

          {/* ============================================================= */}
          {/* BOSS                                                          */}
          {/* ============================================================= */}

          <div
            className="
              pointer-events-none
              absolute
              inset-0
              z-10
            "
          >
            <BossScene mouse={mouse} />
          </div>

          {/* ============================================================= */}
          {/* DESKTOP FLOATING CARDS                                        */}
          {/* ============================================================= */}

          <div className="hidden lg:block">
            <ProductionCard
              number="01"
              eyebrow="Production"
              title="Brief"
              className="
                left-[47%]
                top-[53%]
              "
              style={cardMotion.brief}
            />

            <ProductionCard
              number="02"
              eyebrow="Production"
              title="Shoot"
              className="
                right-[6%]
                top-[48%]
              "
              style={cardMotion.shoot}
            />

            <ProductionCard
              number="03"
              eyebrow="Post"
              title="Edit"
              className="
                bottom-[12%]
                left-[6%]
              "
              style={cardMotion.edit}
            />

            <ProductionCard
              number="04"
              eyebrow="Approval"
              title="Review"
              className="
                bottom-[10%]
                right-[17%]
              "
              style={cardMotion.review}
            />
          </div>

          {/* ============================================================= */}
          {/* MOBILE MINI CARDS                                             */}
          {/* ============================================================= */}

          <div className="lg:hidden">
            <div
              className="
                absolute
                bottom-3
                left-4
                z-50
                flex
                gap-1.5
              "
            >
              {[
                ["01", "BRIEF"],
                ["02", "SHOOT"],
                ["03", "EDIT"],
              ].map(([number, label]) => (
                <div
                  key={label}
                  className="
                    rounded-full
                    border
                    border-white/10
                    bg-white/[0.035]
                    px-2.5
                    py-1
                    text-[6px]
                    font-medium
                    tracking-[0.14em]
                    text-white/45
                    backdrop-blur-md
                  "
                >
                  {number} {label}
                </div>
              ))}
            </div>
          </div>

          {/* ============================================================= */}
          {/* WORKSPACE STATUS                                              */}
          {/* ============================================================= */}

          <div
            className="
              absolute
              bottom-3
              right-4
              z-50
              flex
              items-center
              gap-1.5
              lg:bottom-8
              lg:left-12
              lg:right-auto
            "
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#00d99b] shadow-[0_0_10px_rgba(0,217,155,0.9)] lg:h-2 lg:w-2" />

            <span className="text-[6px] font-medium uppercase tracking-[0.2em] text-white/40 lg:text-[9px] lg:tracking-[0.23em]">
              Creative workspace
            </span>
          </div>
        </section>

        {/* =============================================================== */}
        {/* RIGHT LOGIN SIDE                                                 */}
        {/* =============================================================== */}

        <section
          className="
            relative
            h-[57%]
            w-full
            shrink-0
            overflow-hidden
            bg-[#f3eee5]
            lg:h-full
            lg:w-[42%]
          "
        >
          {/* Background glow */}
          <div
            className="
              pointer-events-none
              absolute
              right-[-130px]
              top-[-130px]
              h-[330px]
              w-[330px]
              rounded-full
              bg-[#e6bf8e]/20
              blur-[90px]
            "
          />

          <div
            className="
              pointer-events-none
              absolute
              bottom-[-150px]
              left-[-130px]
              h-[300px]
              w-[300px]
              rounded-full
              border
              border-[#c6a77d]/10
            "
          />

          <div
            className="
              relative
              mx-auto
              flex
              h-full
              w-full
              max-w-[590px]
              flex-col
              justify-center
              px-5
              py-5
              sm:px-8
              lg:px-10
              xl:px-12
            "
          >
            {/* =========================================================== */}
            {/* PRIVATE WORKSPACE                                           */}
            {/* =========================================================== */}

            <div
              className="
                absolute
                right-5
                top-4
                text-right
                lg:right-10
                lg:top-8
              "
            >
              <div className="text-[6px] font-medium uppercase tracking-[0.27em] text-[#7190b5] lg:text-[8px]">
                Private workspace
              </div>

              <div className="mt-0.5 text-[7px] text-[#9eabbc] lg:mt-1 lg:text-[9px]">
                Rare Fiction OS
              </div>
            </div>

            {/* =========================================================== */}
            {/* HEADING                                                      */}
            {/* =========================================================== */}

            <div className="mb-3.5 lg:mb-5">
              <div className="mb-1.5 text-[7px] font-medium uppercase tracking-[0.25em] text-[#7190b5] lg:mb-2.5 lg:text-[9px]">
                Welcome back
              </div>

              <h2
                className="
                  max-w-[440px]
                  text-[24px]
                  font-semibold
                  leading-[0.98]
                  tracking-[-0.045em]
                  text-[#0c1022]
                  sm:text-[28px]
                  lg:text-[38px]
                  xl:text-[41px]
                "
              >
                Sign in to your
                <br />
                workspace.
              </h2>

              <p
                className="
                  mt-2
                  max-w-[430px]
                  text-[9px]
                  leading-4
                  text-[#315379]
                  sm:text-[10px]
                  lg:mt-3
                  lg:text-[12px]
                  lg:leading-5
                "
              >
                Use your company account to access the Rare Fiction
                creative workspace.
              </p>
            </div>

            {/* =========================================================== */}
            {/* FORM CARD                                                    */}
            {/* =========================================================== */}

            <form
              onSubmit={handleSubmit}
              className="
                relative
                w-full
                rounded-[20px]
                border
                border-white
                bg-white/90
                p-4
                shadow-[0_22px_60px_rgba(38,43,50,0.11)]
                backdrop-blur-xl
                sm:p-5
                lg:rounded-[24px]
                lg:p-6
              "
            >
              {/* EMAIL */}
              <div className="mb-2 flex items-center justify-between">
                <label className="text-[9px] font-semibold text-[#132849] lg:text-[11px]">
                  Email
                </label>

                <span className="text-[6px] uppercase tracking-[0.16em] text-[#c1ccdb] lg:text-[8px] lg:tracking-[0.18em]">
                  Company account
                </span>
              </div>

              <div className="relative">
                <span
                  className="
                    pointer-events-none
                    absolute
                    left-3.5
                    top-1/2
                    h-2
                    w-2
                    -translate-y-1/2
                    rounded-full
                    border
                    border-[#b7c7dd]
                    lg:left-4
                  "
                />

                <input
                  type="email"
                  value={email}
                  onChange={(event) =>
                    setEmail(event.target.value)
                  }
                  placeholder="you@company.com"
                  autoComplete="email"
                  className="
                    h-[46px]
                    w-full
                    rounded-[13px]
                    border
                    border-[#dbe4ef]
                    bg-[#eaf1fc]
                    px-9
                    text-[11px]
                    text-[#111827]
                    outline-none
                    transition-all
                    duration-200
                    placeholder:text-[#7890ae]
                    focus:border-[#aebfd7]
                    focus:bg-white
                    focus:ring-4
                    focus:ring-[#d0ddec]/40
                    lg:h-[54px]
                    lg:rounded-[15px]
                    lg:px-10
                    lg:text-[13px]
                  "
                />
              </div>

              {/* PASSWORD */}
              <div className="mb-2 mt-3.5 flex items-center justify-between lg:mt-5">
                <label className="text-[9px] font-semibold text-[#132849] lg:text-[11px]">
                  Password
                </label>

                <span className="text-[6px] uppercase tracking-[0.16em] text-[#c1ccdb] lg:text-[8px] lg:tracking-[0.18em]">
                  Protected
                </span>
              </div>

              <div className="relative">
                <span
                  className="
                    pointer-events-none
                    absolute
                    left-3.5
                    top-1/2
                    h-2
                    w-2
                    -translate-y-1/2
                    rounded-full
                    border
                    border-[#b7c7dd]
                    lg:left-4
                  "
                />

                <input
                  type="password"
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className="
                    h-[46px]
                    w-full
                    rounded-[13px]
                    border
                    border-[#dbe4ef]
                    bg-[#eaf1fc]
                    px-9
                    text-[11px]
                    text-[#111827]
                    outline-none
                    transition-all
                    duration-200
                    placeholder:text-[#7890ae]
                    focus:border-[#aebfd7]
                    focus:bg-white
                    focus:ring-4
                    focus:ring-[#d0ddec]/40
                    lg:h-[54px]
                    lg:rounded-[15px]
                    lg:px-10
                    lg:text-[13px]
                  "
                />
              </div>

              {/* ERROR */}
              {error && (
                <div
                  className="
                    mt-2.5
                    rounded-[10px]
                    border
                    border-red-200
                    bg-red-50
                    px-3
                    py-2
                    text-[9px]
                    font-medium
                    text-red-700
                    lg:mt-3
                    lg:rounded-[12px]
                    lg:px-3.5
                    lg:py-2.5
                    lg:text-[11px]
                  "
                >
                  {error}
                </div>
              )}

              {/* ========================================================= */}
              {/* SIGN IN BUTTON                                             */}
              {/* ========================================================= */}

              <button
                type="submit"
                disabled={loading}
                className="
                  group
                  relative
                  mt-3.5
                  flex
                  h-[48px]
                  w-full
                  items-center
                  justify-center
                  overflow-hidden
                  rounded-[13px]
                  bg-[#151515]
                  text-[11px]
                  font-semibold
                  text-white
                  shadow-[0_15px_30px_rgba(0,0,0,0.17)]
                  transition-all
                  duration-300
                  hover:-translate-y-0.5
                  hover:bg-[#080808]
                  hover:shadow-[0_20px_40px_rgba(0,0,0,0.22)]
                  active:translate-y-0
                  disabled:cursor-not-allowed
                  disabled:opacity-60
                  lg:mt-5
                  lg:h-[55px]
                  lg:rounded-[15px]
                  lg:text-[13px]
                "
              >
                <span
                  className="
                    pointer-events-none
                    absolute
                    inset-y-0
                    -left-24
                    w-24
                    skew-x-[-20deg]
                    bg-white/10
                    transition-all
                    duration-700
                    group-hover:left-[120%]
                  "
                />

                <span className="relative">
                  {loading ? "Signing in..." : "Sign in"}
                </span>

                {!loading && (
                  <span
                    className="
                      relative
                      ml-2
                      text-white/45
                      transition-all
                      duration-300
                      group-hover:translate-x-1
                      group-hover:text-white
                      lg:ml-3
                    "
                  >
                    →
                  </span>
                )}
              </button>

              {/* STATUS */}
              <div className="mt-2.5 flex items-center justify-between lg:mt-4">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#00c98c] shadow-[0_0_9px_rgba(0,201,140,0.7)]" />

                  <span className="text-[6px] font-medium uppercase tracking-[0.16em] text-[#7890ad] lg:text-[8px] lg:tracking-[0.18em]">
                    Company access only
                  </span>
                </div>

                <span className="text-[6px] uppercase tracking-[0.16em] text-[#c1cad6] lg:text-[8px] lg:tracking-[0.18em]">
                  RF / OS
                </span>
              </div>
            </form>

            {/* =========================================================== */}
            {/* FOOTER                                                       */}
            {/* =========================================================== */}

            <div className="mt-2 flex items-center justify-center gap-2 lg:mt-3 lg:gap-3">
              <span className="h-px w-4 bg-[#d6d9dd] lg:w-7" />

              <span className="text-[6px] text-[#7c91aa] lg:text-[8px]">
                Access is provided by your organization.
              </span>

              <span className="h-px w-4 bg-[#d6d9dd] lg:w-7" />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export default Login;