# Quantum Agent — GPU-ready dev image.
# Base: latest NVIDIA PyTorch container (CUDA + cuDNN + PyTorch + LangChain-friendly).
ARG BASE=nvcr.io/nvidia/pytorch:latest
FROM ${BASE}

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    PNPM_HOME=/root/.local/share/pnpm \
    PATH=/root/.local/share/pnpm:/root/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# Toolchain — installed via mise so versions match .mise.toml exactly.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl git jq build-essential pkg-config libsqlite3-dev \
        ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# mise — single tool to install node, python, pnpm, biome, deno, uv, gh, sccache.
RUN curl -fsSL https://mise.run | sh \
    && ln -s /root/.local/bin/mise /usr/local/bin/mise

# Pre-warm the toolchain. The .mise.toml in the workspace will install on first run.
RUN mise install node@26 python@3.14 pnpm@latest || true

# LangChain (the user asked for it pre-baked).
RUN pip install --no-cache-dir langchain langchain-anthropic openai whisper-cpp-pybind || true

WORKDIR /workspace
COPY entrypoint.sh /usr/local/bin/quantum-entrypoint
RUN chmod +x /usr/local/bin/quantum-entrypoint

EXPOSE 8765
ENTRYPOINT ["/usr/local/bin/quantum-entrypoint"]
CMD ["quantum", "doctor"]
