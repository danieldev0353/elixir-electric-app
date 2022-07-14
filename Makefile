
.PHONY: compile tests start_dev_env stop_dev_env integration_tests
compile:
	mix local.hex --force
	mix local.rebar --force
	mix deps.get
	mix compile

release:
	MIX_ENV="prod" mix release

tests:
	mix test

integration_tests:
	INTETGRATION=1 mix test

DC_CONFIG=compose.yaml

start_dev_env:
	docker-compose -f ${DC_CONFIG} up -d

stop_dev_env:
	docker-compose -f ${DC_CONFIG} down

docker-build:
	docker build -t electric:local-build .

docker-clean:
ifneq ($(docker images -q electric:local-build 2> /dev/null), "")
	docker image rm -f electric:local-build
endif
