FROM public.ecr.aws/lambda/nodejs:20

WORKDIR ${LAMBDA_TASK_ROOT}

# Install production deps only (build step runs before docker build — see build_and_push.sh)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy pre-built bundle (esbuild output, see build_and_push.sh step 1)
COPY dist/ ./

CMD ["index.handler"]
