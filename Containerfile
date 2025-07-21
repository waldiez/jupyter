#####################################################################################
# Build Step
# Build the frontend and backend parts of the extension
#####################################################################################
FROM python:3.12-slim AS builder

ENV DEBIAN_FRONTEND=noninteractive

# install system dependencies
RUN apt update && \
    apt install -y \
    curl \
    unzip \
    git \
    ca-certificates \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev && \
    curl -fsSL https://deb.nodesource.com/setup_22.x -o nodesource_setup.sh && \
    bash nodesource_setup.sh && \
    apt install -y nodejs && \
    apt clean && \
    rm -rf /var/lib/apt/lists/* && \
    rm -rf /var/cache/apt/archives/*

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
    yarn install && \
    yarn postinstall && \
    yarn build && \
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
ENV PYTHONUNBUFFERED=1
ENV DEBIAN_FRONTEND="noninteractive"
ENV DEBCONF_NONINTERACTIVE_SEEN=true

# install system dependencies
RUN apt update && \
    apt upgrade -y && \
    apt install -y --no-install-recommends \
    tzdata \
    locales \
    bzip2 \
    ca-certificates \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    wget \
    fonts-liberation \
    git \
    sudo \
    openssl \
    pandoc \
    curl \
    tini \
    zip \
    unzip \
    jq \
    graphviz \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    libgdk-pixbuf2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    xvfb && \
    curl -fsSL https://deb.nodesource.com/setup_22.x -o nodesource_setup.sh && \
    bash nodesource_setup.sh && \
    rm nodesource_setup.sh && \
    apt install -y nodejs && \
    npm install -g corepack && \
    corepack enable && \
    yarn set version stable && \
    npx playwright install-deps && \
    sed -i -e 's/# en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen && \
    locale-gen en_US.UTF-8 && \
    apt clean && \
    rm -rf /var/lib/apt/lists/* && \
    rm -rf /var/cache/apt/archives/*

ENV LANG=en_US.UTF-8 \
    LANGUAGE=en_US.UTF-8 \
    LC_ALL=en_US.UTF-8 \
    LC_CTYPE=en_US.UTF-8 \
    TZ=Etc/UTC


# Add ChromeDriver and Chrome
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then \
    CHROME_ARCH="linux64"; \
    elif [ "$ARCH" = "aarch64" ]; then \
    CHROME_ARCH="linux64"; \
    else \
    echo "Unsupported architecture: $ARCH" && exit 1; \
    fi && \
    LATEST_VERSION=$(curl -s "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json" | \
    jq -r '.channels.Stable.version') && \
    echo "Installing Chrome and ChromeDriver version: $LATEST_VERSION for $CHROME_ARCH" && \
    # Install Chrome
    curl -Lo /tmp/chrome.zip "https://edgedl.me.gvt1.com/edgedl/chrome/chrome-for-testing/${LATEST_VERSION}/${CHROME_ARCH}/chrome-linux64.zip" && \
    unzip /tmp/chrome.zip -d /opt && \
    ln -sf /opt/chrome-linux64/chrome /usr/bin/google-chrome && \
    # Install ChromeDriver
    curl -Lo /tmp/chromedriver.zip "https://edgedl.me.gvt1.com/edgedl/chrome/chrome-for-testing/${LATEST_VERSION}/${CHROME_ARCH}/chromedriver-linux64.zip" && \
    unzip /tmp/chromedriver.zip -d /usr/local/bin && \
    mv /usr/local/bin/chromedriver-linux64/chromedriver /usr/local/bin/chromedriver && \
    chmod +x /usr/local/bin/chromedriver && \
    rm -rf /tmp/chrome.zip /tmp/chromedriver.zip /usr/local/bin/chromedriver-linux64

# Add GeckoDriver (for Firefox)
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then \
    GECKO_ARCH="linux64"; \
    elif [ "$ARCH" = "aarch64" ]; then \
    GECKO_ARCH="linux-aarch64"; \
    else \
    echo "Unsupported architecture: $ARCH" && exit 1; \
    fi && \
    # Add Mozilla's signing key the modern way
    curl -fsSL https://packages.mozilla.org/apt/repo-signing-key.gpg | \
    gpg --dearmor -o /etc/apt/trusted.gpg.d/mozilla.gpg && \
    echo "deb https://packages.mozilla.org/apt mozilla main" > /etc/apt/sources.list.d/mozilla.list && \
    apt-get update && \
    apt-get install -y firefox && \
    # Get Firefox version and find compatible GeckoDriver
    FIREFOX_VERSION=$(firefox --version | grep -oP '\d+\.\d+') && \
    echo "Firefox version: $FIREFOX_VERSION" && \
    # Get latest GeckoDriver (it's generally backward compatible)
    GECKO_VERSION=$(curl -s https://api.github.com/repos/mozilla/geckodriver/releases/latest | jq -r '.tag_name') && \
    echo "GeckoDriver version: $GECKO_VERSION for $GECKO_ARCH" && \
    curl -Lo /tmp/geckodriver.tar.gz "https://github.com/mozilla/geckodriver/releases/download/${GECKO_VERSION}/geckodriver-${GECKO_VERSION}-${GECKO_ARCH}.tar.gz" && \
    tar -xzf /tmp/geckodriver.tar.gz -C /usr/local/bin && \
    chmod +x /usr/local/bin/geckodriver && \
    rm /tmp/geckodriver.tar.gz && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN sed -i 's/^#force_color_prompt=yes/force_color_prompt=yes/' /etc/skel/.bashrc

# add a non-root user
ARG GROUP_ID=1000
ENV GROUP_ID=${GROUP_ID}
RUN addgroup --system --gid ${GROUP_ID} waldiez
ARG USER_ID=1000
ENV USER_ID=${USER_ID}
RUN adduser --disabled-password --gecos '' --shell /bin/bash --uid ${USER_ID} --gid ${GROUP_ID} waldiez
RUN echo "waldiez ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/90-waldiez
RUN mkdir -p /home/waldiez/notebooks /home/waldiez/tmp /home/waldiez/.local/bin && \
    chown -R waldiez:waldiez /home/waldiez

USER waldiez

ENV PATH=/home/waldiez/.local/bin:${PATH}
ENV PIP_USER=1
ENV PIP_BREAK_SYSTEM_PACKAGES=1

# Set display for headless operations if needed
ENV DISPLAY=:99

RUN pip install --upgrade pip jupyterhub jupyterlab ipywidgets ipykernel

COPY --chown=waldiez:waldiez scripts /home/waldiez/scripts
RUN chmod +x /home/waldiez/scripts/start.sh

COPY --from=builder --chown=waldiez:waldiez /tmp/package/waldiez_jupyter/dist/*.whl /home/waldiez/tmp/
RUN pip install /home/waldiez/tmp/*.whl && \
    rm -rf /home/waldiez/tmp

RUN mkdir -p /home/waldiez/.local/share/jupyter/lab/settings && \
    cat > /home/waldiez/.local/share/jupyter/lab/settings/overrides.json <<EOF
{
    "@jupyterlab/apputils-extension:themes": {
        "theme": "JupyterLab Dark"
    },
    "@jupyterlab/terminal-extension:plugin": {
        "shellCommand": "/bin/bash"
    }
}
EOF

EXPOSE 8888
VOLUME /home/waldiez/notebooks
WORKDIR /home/waldiez/notebooks

ENV TINI_SUBREAPER=true
ENTRYPOINT ["/usr/bin/tini", "--"]

CMD ["/home/waldiez/scripts/start.sh"]
