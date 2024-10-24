#####################################################################################
# Build Step
# Build the frontend and backend parts of the extension
#####################################################################################
FROM ubuntu:24.04 as builder

ENV DEBIAN_FRONTEND=noninteractive

# install system dependencies
RUN apt update && \
    apt install -y curl unzip git ca-certificates python3-dev python3-pip && \
    curl -fsSL https://deb.nodesource.com/setup_20.x -o nodesource_setup.sh && \
    bash nodesource_setup.sh && \
    apt install -y nodejs && \
    apt clean && \
    rm -rf /var/lib/apt/lists/* && \
    rm -rf /var/cache/apt/archives/*

# install bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH=/root/.bun/bin:${PATH}

# install yarn
RUN npm install -g corepack && \
    corepack enable && \
    yarn set version stable

WORKDIR /tmp/package

# install python dependencies
RUN pip3 install --break-system-packages jupyterlab build

COPY requirements/main.txt /tmp/requirements.txt
RUN pip3 install --break-system-packages -r /tmp/requirements.txt && \
    rm -f /tmp/requirements.txt

# build the extension
COPY . /tmp/package/waldiez_jupyter
WORKDIR /tmp/package/waldiez_jupyter

RUN touch yarn.lock && \
    jlpm install && \
    jlpm build:lib:prod && \
    jlpm build:prod && \
    python3 -m build

#####################################################################################
# Final image
#####################################################################################
FROM python:3.12-slim

LABEL maintainer="waldiez <development@waldiez.io>"
LABEL org.opencontainers.image.source="quay.io/waldiez/jupyter"
LABEL org.opencontainers.image.title="waldiez/jupyter"
LABEL org.opencontainers.image.description="JupyterLab with waldiez extension installed"

# set environment variables
ENV PYTHONUNBUFFERED 1
ENV DEBIAN_FRONTEND="noninteractive"
ENV DEBIAN_FRONTEND noninteractive
ENV DEBCONF_NONINTERACTIVE_SEEN true
ENV LANG=en_US.UTF-8 \
    LANGUAGE=en_US:en \
    LC_ALL=en_US.UTF-8 \
    TZ=Etc/UTC

# install system dependencies
RUN apt update && \
    apt upgrade -y && \
    apt install -y --no-install-recommends \
    tzdata \
    locales \
    bzip2 \
    ca-certificates \
    build-essential \
    wget \
    fonts-liberation \
    git \
    sudo \
    openssl \
    pandoc \
    curl \
    tini \
    zip \
    unzip && \
    sed -i -e 's/# en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen && \
    locale-gen && \
    apt clean && \
    rm -rf /var/lib/apt/lists/* && \
    rm -rf /var/cache/apt/archives/*

# install nodejs
RUN curl -fsSL https://deb.nodesource.com/setup_20.x -o nodesource_setup.sh && \
    bash nodesource_setup.sh && \
    apt install -y nodejs && \
    apt clean && \
    rm -rf /var/lib/apt/lists/* && \
    rm -rf /var/cache/apt/archives/*

RUN sed -i 's/^#force_color_prompt=yes/force_color_prompt=yes/' /etc/skel/.bashrc

# add a non-root user
ARG GROUP_ID=1000
ENV GROUP_ID=${GROUP_ID}
RUN addgroup --system --gid ${GROUP_ID} user
ARG USER_ID=1000
ENV USER_ID=${USER_ID}
RUN adduser --disabled-password --gecos '' --shell /bin/bash --uid ${USER_ID} --gid ${GROUP_ID} user
RUN echo "user ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/90-user
RUN mkdir -p /home/user/notebooks /home/user/tmp /home/user/.local/bin && \
    chown -R user:user /home/user
ENV PATH=/home/user/.local/bin:${PATH}

USER user
RUN pip install --upgrade pip jupyterlab ipywidgets ipykernel

COPY --chown=user:user scripts /home/user/scripts
RUN chmod +x /home/user/scripts/start.sh

COPY --from=builder --chown=user:user /tmp/package/waldiez_jupyter/dist/*.whl /home/user/tmp/
RUN pip install --user /home/user/tmp/*.whl && \
    rm -rf /home/user/tmp

RUN mkdir -p /home/user/.local/share/jupyter/lab/settings && \
    echo '{"@jupyterlab/apputils-extension:themes":{"theme": "JupyterLab Dark"}}' > /home/user/.local/share/jupyter/lab/settings/overrides.json


EXPOSE 8888
VOLUME /home/user/notebooks
WORKDIR /home/user/notebooks

ENV TINI_SUBREAPER=true
ENTRYPOINT ["/usr/bin/tini", "--"]

CMD ["/home/user/scripts/start.sh"]
