---
title: "NPU 위에서 LLM은 어떻게 움직이는가: 일반 구조와 Snapdragon 8 Elite로 본 Runtime End-to-End"
date: "2026-04-20"
category: "On-Device AI"
tags: ["NPU", "Snapdragon 8 Elite", "Hexagon", "On-Device LLM", "QNN", "Inference"]
---

# NPU 위에서 LLM은 어떻게 움직이는가: 일반 구조와 Snapdragon 8 Elite로 본 Runtime End-to-End

스마트폰 안에서 7B 파라미터짜리 LLM이 돌아간다는 말을 처음 들었을 때, 무엇보다 먼저 궁금했던 건 "도대체 그 작은 칩이 어떻게 저 큰 행렬 곱을 감당하지?" 였다. 답의 중심에는 항상 **NPU(Neural Processing Unit)**가 있다.

이 글은 **일반적인 NPU가 어떻게 생겼고, 앱이 추론을 한 번 호출했을 때 NPU 내부에서 무슨 일이 벌어지는지**를 따라간다. 모든 NPU가 공유하는 공통 구조를 먼저 이야기하고, 그 자리마다 구체적인 이름은 Qualcomm **Snapdragon 8 Elite의 Hexagon NPU**를 예시로 든다[^1]. 즉 "NPU는 이런 거고, Qualcomm은 이걸 이런 이름으로 부른다" 식이다. 다른 벤더 (Apple ANE, Google TPU, MediaTek APU, Samsung NPU)도 대체로 같은 패턴을 따른다.

[^1]: 이 글의 수치와 용어는 Qualcomm이 공개한 Hexagon SDK, QAIRT(Qualcomm AI Runtime) / QNN SDK 문서와 2024~2025년 Snapdragon 발표 자료를 기준으로 한다. 구체적인 마이크로아키텍처는 칩마다 조금씩 다르지만, 본 글은 큰 그림을 해치지 않는 수준에서 개략화했다.

> **이 글의 범위.** 모델을 어떻게 양자화하고 그래프를 컴파일하는지 같은 *offline* 파이프라인은 다루지 않는다. 이미 그 결과물(compiled graph artifact — Qualcomm에서는 *context binary*)이 기기의 앱 번들 안에 들어있고, 프로세스가 그걸 로드한 상태에서 **런타임에 벌어지는 일**만 본다.

## 왜 하필 NPU인가

같은 행렬 곱을 CPU로 돌리면 코어 수가 모자라고, GPU로 돌리면 전력이 폭발한다. **NPU는 "뉴럴넷이 하는 연산만 잘하면 된다"는 가정 위에 설계된 ASIC**이다. 행렬 곱(MatMul)과 element-wise 연산 몇 개, Softmax, LayerNorm만 아주 빠르게 실행할 수 있으면, 그 외의 범용성을 희생해서 **전력당 처리량(TOPS/W)**을 수십 배 끌어올릴 수 있다.

| 연산 주체 | LLM decode 성능 (대략) | 전력 | 특징 |
|---|---|---|---|
| CPU (ARM, SIMD) | 3~8 tok/s | 보통 | 병렬성 부족 |
| GPU (Adreno 계열) | 15~30 tok/s | 높음 | 그래픽과 리소스 공유 |
| NPU (Hexagon 등) | 30~60 tok/s | 낮음 | MatMul 전용 HW |

Snapdragon 8 Elite의 Hexagon NPU는 INT8 기준 **45 TOPS** 이상의 처리량을 낸다. 숫자 자체보다 중요한 것은 "그 TOPS를 런타임이 실제로 어떻게 먹이느냐"이고, 이게 이 글의 전부다.

## NPU는 대체로 이렇게 생겼다

NPU를 블랙박스로 보면 아무 그림이 안 그려진다. 벤더가 달라도 LLM이 돌아가는 NPU는 다음 다섯 블록이 거의 공통적으로 있다.

1. **Matrix Engine** — 빽빽한 MAC(multiply-accumulate) 배열. MatMul을 한 사이클에 수천 번 씹는다. 모든 주요 벤더가 이 자리에 전용 하드웨어를 붙여놓는다.
2. **Vector Engine** — SIMD 벡터 유닛. element-wise, reduction, 활성화, dequantization 같이 "MatMul 전후에 끼어드는" 모든 연산을 맡는다.
3. **Scalar Control** — 주소 계산, loop index, 분기처럼 벡터화하기 어려운 제어 흐름.
4. **On-chip Scratchpad (SW-managed SRAM)** — CPU의 캐시와 달리 **하드웨어가 자동으로 채워주지 않고 컴파일러/소프트웨어가 명시적으로 채우는** 소량의 고속 메모리. LLM을 NPU에 얹는 엔지니어링 싸움은 대부분 이 메모리를 둘러싸고 벌어진다.
5. **DMA Engine** — DRAM과 on-chip SRAM 사이를 비동기로 실어 나른다. 연산과 **동시에** 돈다는 점이 핵심이다.

<div class="fig-interactive">
  <div class="fig-plot" style="text-align:center; padding: 1rem 0;">
    <img src="/blog/posts/assets/on-device-llm-npu-snapdragon/fig1-hexagon-npu.svg" alt="일반적인 NPU 내부 구조 (Hexagon 예시)" style="max-width:100%; height:auto;">
  </div>
  <div class="fig-caption"><strong>Figure 1.</strong> NPU의 일반적인 내부 구조. Matrix Engine · Vector Engine · Scalar Control · On-chip SRAM · DMA. 괄호 안 이름이 Qualcomm Hexagon 기준의 구체적 명칭이다 (HMX / HVX / VTCM).</div>
</div>

구체적으로 Snapdragon 8 Elite의 Hexagon NPU에 이 이름들을 대응하면:

- Matrix Engine → **HMX (Hexagon Matrix eXtensions)**. INT4, INT8, INT16, FP16 MAC을 하드웨어로 지원한다. LLM 추론 시간의 80% 이상이 여기서 일어난다.
- Vector Engine → **HVX (Hexagon Vector eXtensions)**. 1024-bit SIMD. Softmax, LayerNorm, RoPE[^2], 활성화 함수, residual add, dequantization을 담당한다.
- Scalar Control → Hexagon Scalar cluster.
- On-chip SRAM → **VTCM (Vector Tightly Coupled Memory)**. **약 8 MB**[^3]의 SW-managed scratchpad. 하드웨어 전체 용량 중 사용자가 주소 접근 가능한 영역은 그중 일부로 제한되고, 컴파일러가 여기 offset을 할당한다.
- DMA → Hexagon DMA.

[^2]: RoPE(Rotary Position Embedding)는 Q, K 벡터에 위치 정보를 2차원 회전 행렬로 곱해주는 연산이다. element-wise sin/cos 곱이라 vector engine에서 수행하기 적합하다.

[^3]: 세대별로 8 MB 근방이며, 새 칩에서는 더 커지는 추세다. 런타임 입장에서 중요한 건 절대 용량이 아니라 "모델 한 layer의 핵심 working set이 여기 들어오는가"다.

> 메모리 계층을 한 문장으로 요약하면: **DRAM (수십 GB/s)  →  DMA  →  On-chip SRAM (수 TB/s effective)  →  Matrix / Vector engine**. 위로 올라갈수록 대역폭은 100배 이상 빨라지고, 공간은 수천 배 작아진다. **LLM을 NPU에 얹는 일은 사실상 "on-chip SRAM에 뭘 얼마나 오래 머무르게 할 것인가"의 싸움이다.**

## 벤더 런타임 스택 — NPU는 혼자 있지 않다

앱이 NPU를 직접 건드릴 수는 없다. 중간에는 벤더가 제공하는 런타임 라이브러리가 있고, 이 라이브러리가 대체로 다음 4층 계층을 제공한다. 이름은 벤더마다 조금씩 다르지만 개념은 거의 같다.

| 계층 | 하는 일 | Qualcomm에서의 이름 |
|---|---|---|
| **Backend** | 특정 하드웨어 family를 추상화한 드라이버. CPU / GPU / NPU 각각 다른 backend | `QnnBackend_*` (e.g., HTP backend) |
| **Device** | 논리적 하드웨어 리소스 핸들. 코어 개수·클럭 힌트 등을 설정 | `QnnDevice_*` |
| **Context** | 한 프로세스의 그래프 실행 환경. 컴파일된 그래프를 로드·관리 | `QnnContext_*` |
| **Graph** | 단일 계산 DAG. 노드 추가·finalize·execute의 단위 | `QnnGraph_*` |

앱 입장에서는 이 네 개의 핸들을 들고 다닌다. 런타임 초기화 시퀀스는 대체로 이렇게 생겼다.

```c
// 1) backend 로드 (NPU 전용 드라이버)
QnnBackend_create(&logHandle, backendConfig, &backendHandle);

// 2) device 핸들 획득
QnnDevice_create(logHandle, deviceConfig, &deviceHandle);

// 3) 이미 컴파일되어 있던 그래프(artifact)를 역직렬화해서 로드
QnnContext_createFromBinary(backendHandle, deviceHandle,
                            contextConfig, serializedBlob, blobSize,
                            &contextHandle, /*profile=*/NULL);

// 4) context 안에서 그래프 핸들 꺼내기
QnnContext_retrieveGraph(contextHandle, "llama_decode", &graphHandle);
```

여기서 **중요한 포인트**: `QnnContext_createFromBinary`가 한 번 돌면 그 안엔 "layer를 어떤 순서로, 어떤 tile 크기로, DMA를 언제 걸지가 결정된 스케줄"이 이미 다 박혀있다. 런타임은 이걸 *푸는* 게 아니라 *재생*한다. 이 스케줄을 누가 어떻게 만들었는지는 잠시 뒤에서 본다.

HTP backend는 configurable한 knob이 꽤 있다. 실전에서 엔지니어가 실제로 조정하는 것들은 다음과 같다.

- **VTCM 크기** — `QnnHtpGraph_ConfigOption_t::VTCM_SIZE_IN_MB`. 한 그래프가 on-chip SRAM을 얼마나 점유할지. 여러 모델을 동시에 돌린다면 이걸 쪼개서 나눠줘야 한다.
- **Vector engine 스레드 수** — `NUM_HVX_THREADS`. Vector 쪽 병렬도.
- **Matrix engine frequency** — `HMX_BOUNDING`. thermal/전력 예산에 맞춰 상한을 고정한다.
- **Parallel graph execution** — `PARALLEL_GRAPH_EXECUTION_CONFIG`. 여러 그래프가 동시에 돌 때 scratchpad를 offset으로 분할한다.
- **Precision / Optimization level** — float/quantized, O2/O3 등.

이 knob들이 전부 *컴파일 시점 또는 컨텍스트 생성 시점*에 결정된다는 점이 중요하다. 런타임 hot path에는 분기가 거의 없다.

## 한 번의 추론 호출이 NPU까지 내려가는 길

앱 코드는 보통 한 줄이다.

```c
QnnGraph_execute(graphHandle,
                 inputs, numInputs,
                 outputs, numOutputs,
                 /*profile=*/NULL, /*signal=*/NULL);
```

이 한 줄 안에서 실제로 일어나는 일은 CPU·NPU 두 프로세서와 그 사이 공유 메모리·IPC 레이어까지 포괄하는 꽤 긴 여정이다.

<div class="fig-interactive">
  <div class="fig-plot" style="text-align:center; padding: 1rem 0;">
    <img src="/blog/posts/assets/on-device-llm-npu-snapdragon/fig2-runtime-stack.svg" alt="Runtime Stack" style="max-width:100%; height:auto;">
  </div>
  <div class="fig-caption"><strong>Figure 2.</strong> 이미 로드된 그래프 상태에서 forward 1회(한 토큰)가 지나가는 경로. ① App → ② Vendor Runtime → ③ Host↔Accelerator IPC → ④ On-NPU Scheduler → ⑤ NPU 코어 ↔ ⑥ DRAM → ⑦ return. 괄호 안은 Qualcomm 이름.</div>
</div>

단계별로 하나씩 풀어보자.

### ① Application — 경계 밖의 책임

앱 쪽에서는 NPU가 이해할 수 없는 것들을 먼저 처리한다. 토크나이저로 텍스트를 token ID로 바꾸고, 이전 step의 logit에서 `top-p` 샘플링으로 다음 토큰을 고른다. 이 두 가지는 **여전히 host CPU에서 도는 일**이다. 각각 수십 μs밖에 안 걸리지만, 매 토큰마다 꼬박꼬박 지불되는 고정비다.

앱은 또한 NPU에 건네줄 **입출력 버퍼**를 미리 만들어 둔다. 보통 3종이다.

1. **현재 token의 임베딩 또는 ID** (크기 ~수십 KB)
2. **KV cache buffer** (layer × head × pos × d_head, 수백 MB)
3. **logit output buffer** (vocab 크기, ~수십 KB)

핵심은 이 버퍼들이 **공유 메모리에 할당되어 있어야** NPU가 zero-copy로 직접 접근할 수 있다는 점이다[^4]. 일반 `malloc()`으로 잡은 메모리면 매번 복사가 일어나서 decode 전체가 수 ms 이상 느려진다. 벤더 런타임이 제공하는 메모리 타입은 대체로 3가지로 요약된다.

| 타입 | 의미 |
|---|---|
| **ION-backed** | Android ION heap에서 할당한 공유 페이지 |
| **DMA-BUF-backed** | Linux dma-buf subsystem이 관리 |
| **Custom backend-specific** | 벤더 고유 allocator (예: NPU만의 tightly-coupled heap) |

Qualcomm QNN에서는 이걸 각각 `QNN_MEM_TYPE_ION`, `QNN_MEM_TYPE_DMA_BUF`, `QNN_MEM_TYPE_CUSTOM`으로 열거하고, `QnnMem_register()`로 externally allocated memory를 런타임에 등록한다. HTP backend에서는 한 단계 더 들어가서 **목적별 버퍼 종류**를 구분한다.

- **Shared Buffer** — 하나의 fd에 여러 텐서가 offset으로 공존. 같은 physical buffer를 여러 input/output이 zero-copy로 본다.
- **Weights Buffer** — **여러 번의 execute 호출 사이에 persist되는 weight용 버퍼.** LLM처럼 weight가 수 GB인 경우 매번 다시 매핑하면 비싸기 때문에 이 타입이 필수적이다.
- **Shared Spill/Fill Buffer** — on-chip SRAM이 모자랄 때 임시 spill 영역으로 쓰이는 공유 버퍼.

[^4]: Android의 ION heap, Linux dma-buf를 통해 host CPU와 가속기가 같은 물리 페이지를 서로의 주소 공간에 매핑한다. Qualcomm 진영에서는 `rpcmem_alloc()` 같은 API가 이걸 감싸고, QNN runtime은 그 결과를 `QnnMem_register`로 받아들인다.

### ② Vendor Runtime — Graph execute 요청

`Graph_execute()` 호출은 NPU backend(QNN의 경우 HTP backend)로 들어간다. Runtime이 하는 일은 크게 세 가지다.

- 입출력 버퍼가 가속기 쪽이 볼 수 있는 형태인지 확인하고 **tensor descriptor를 구성**한다(shape, dtype, stride, 정규화/양자화 파라미터).
- 이미 로드된 **graph handle**과 이번 호출의 buffer를 묶는다.
- 가속기 쪽 스케줄러의 "execute" 엔트리포인트를 IPC를 통해 호출한다.

여기서 중요한 디테일은 **그래프 전체를 한 번에 가속기로 넘긴다**는 점이다. 순진하게 구현하면 layer마다 IPC를 한 번씩 할 수도 있는데, 호출 오버헤드가 layer 수(수십)만큼 곱해지면 decode 시간의 10~20%가 IPC로 날아간다. 그래서 모든 주요 벤더는 **컴파일 시점에 이미 "전체 그래프를 가속기에서 순차 실행하는 스케줄"을 artifact에 박아두고**, runtime에선 단 한 번의 invoke로 그 전체 스케줄을 착화시킨다.

### ③ Host ↔ Accelerator IPC — 경계 건너기

CPU와 NPU는 사실상 독립된 프로세서다. 둘 사이엔 공유 메모리 기반의 RPC 레이어가 있다. Qualcomm은 이걸 **FastRPC**라고 부른다. 핵심 특징은 두 가지.

- **공유 메모리 기반**: 이미 공유 매핑된 버퍼는 포인터만 넘기면 가속기가 바로 읽을 수 있다. 데이터 자체가 복사되지 않는다.
- **오버헤드 ~μs**: 한 번의 round-trip이 보통의 syscall과 비슷한 수준이다. LLM처럼 큰 그래프를 "한 번에" 쏴버릴 수 있는 구조라면 이 오버헤드는 전체 forward에 0.1% 미만이 된다.

IPC invoke가 떨어지면 NPU 쪽 runtime이 깨어난다.

### ④ On-NPU Scheduler — 컴파일된 스케줄을 재생한다

NPU 쪽 runtime은 host CPU와 독립된 프로세서(Qualcomm의 경우 Hexagon DSP)에서 돈다. 그 위에는 이미 로드된 **실행 스크립트**가 올라가 있다. 스크립트는 각 layer를 어떤 순서로 실행할지, 각 layer 안에서 tile을 어떤 크기로 자를지, DMA를 언제 걸지, on-chip SRAM offset을 어디에 놓을지가 이미 다 결정된 형태다.

한 layer를 실행하는 관점은 대략 이렇다.

```text
for each layer in [embed, L0, L1, ..., L_{n-1}, final_norm, lm_head]:
    1. DMA: 이번 layer의 weight/KV tile을 DRAM → scratchpad로 비동기 예약
    2. Scalar: 주소 / loop index 셋업
    3. Matrix engine dispatch: scratchpad 안에서 MatMul 실행
       ↕ 동시에: DMA가 다음 tile을 미리 가져옴 (double buffer)
    4. Vector engine dispatch: softmax / norm / RoPE / residual add
    5. DMA: 출력 tile을 필요하면 DRAM로 write-back
    6. 다음 layer로 이동
```

여기서 **Matrix engine과 DMA가 병렬로 도는 double buffering**은 반드시 짚고 넘어가야 한다. DMA가 tile $k+1$을 scratchpad로 실어 나르는 동안 matrix engine은 tile $k$를 계산한다. 이 둘이 잘 겹치면 전체 시간은 둘 중 큰 쪽에 묶인다 — prefill이면 compute가 커서 DMA가 가려지고(= matrix engine이 쉬지 않는다), decode면 반대로 DMA가 커서 matrix engine이 노는 순간이 많아진다. 이 구조는 뒤의 prefill/decode 섹션에서 다시 나온다.

### ⑤ NPU Cores — 실제 연산이 벌어지는 밀리 mm²

Matrix, Vector, Scalar, Scratchpad, DMA. 이 다섯이 한 layer를 삼킨다. 런타임에서 중요한 건 **이 유닛들이 동시에 여러 단계에 걸쳐 일하고 있다**는 사실이다.

예를 들어 한 timestep에서 self-attention 블록이 돌 때 NPU 안 풍경은:

- **Matrix engine** — Q/K/V projection의 MatMul 중
- **Vector engine** — 직전 layer의 LayerNorm output을 scale 정규화 중
- **Scalar** — 다음 tile의 주소 준비
- **DMA** — 다음 tile weight를 DRAM에서 scratchpad로 stream 중
- **Scratchpad** — 현재 tile + 다음 tile(double buffer) + KV cache window + softmax state를 모두 보관

네 유닛이 전부 바쁜 상황을 만드는 게 컴파일러의 최상위 목표다.

### ⑥ DRAM — 가장 느리지만 피할 수 없는 바닥

weight 전체(수 GB), KV cache(수백 MB), 그리고 layer-scoped activation은 물리적으로 LPDDR5X DRAM에 있다. **대역폭은 ~70 GB/s 정도**이고, on-chip scratchpad의 TB/s 단위 대역폭 대비 100배 느리다.

런타임의 암묵적 규칙은 **"layer 경계에서만 DRAM을 건드리고, layer 내부는 scratchpad 안에서 끝낸다"**다. 이걸 어기는 그래프는 compile 단계에서 이미 탈락하거나, 아니면 끔찍하게 느려진다.

### ⑦ 결과가 돌아오는 길

마지막 layer(대개 `lm_head`)가 끝나면 NPU는 logit을 output buffer(공유 메모리)에 write하고, IPC를 통해 "done" 시그널을 host에 올린다. Vendor runtime은 `Graph_execute()`를 return하고, 앱은 logit을 받아 sampling으로 다음 토큰을 뽑는다. 그 토큰은 다시 ①의 input이 되어 다음 forward를 일으킨다.

**한 forward = 한 token. 이게 EOS까지 반복된다.** 그리고 이 반복문 안에서 NPU가 겪는 패턴은 매번 같지 않다. 처음 한 번과 그 이후가 완전히 다르다.

## Prefill과 Decode — 같은 NPU, 다른 인생

<div class="fig-interactive">
  <div class="fig-plot" style="text-align:center; padding: 1rem 0;">
    <img src="/blog/posts/assets/on-device-llm-npu-snapdragon/fig3-prefill-decode.svg" alt="Prefill vs Decode" style="max-width:100%; height:auto;">
  </div>
  <div class="fig-caption"><strong>Figure 3.</strong> Prefill은 [N×D]×[D×D] GEMM — matrix engine이 풀가동된다. Decode는 [1×D]×[D×D] GEMV — weight 읽기가 전부라 메모리 대역폭이 병목이 된다.</div>
</div>

사용자가 프롬프트를 입력하면, 첫 forward는 그 프롬프트의 **모든 토큰을 한 번에** 처리한다. 이걸 **prefill**이라고 부른다. 그 이후부터는 모델이 방금 뱉은 토큰 **하나**를 다시 입력으로 받아 다음 토큰을 뱉는다. 이게 **decode**다.

수학적으로 두 단계의 MatMul shape을 비교해보자.

$$
\text{Prefill:} \quad Y = X W^\top, \qquad X \in \mathbb{R}^{N \times d}, \; W \in \mathbb{R}^{d \times d}
$$

$$
\text{Decode:} \quad y = x W^\top, \qquad x \in \mathbb{R}^{1 \times d}, \; W \in \mathbb{R}^{d \times d}
$$

연산량은 각각 $\mathcal{O}(N \cdot d^2)$, $\mathcal{O}(d^2)$. weight를 DRAM에서 한 번 읽어오는 비용은 $\mathcal{O}(d^2)$로 동일한데, prefill은 그 읽어온 weight를 $N$번 재사용한다. 즉 **Arithmetic Intensity**[^5]가 prefill은 $\approx N$, decode는 $\approx 1$이다.

[^5]: Arithmetic Intensity = FLOP / byte. 1 byte를 메모리에서 읽어와서 몇 번의 부동소수점 연산을 하느냐다. 이 값이 하드웨어의 "FLOPS / memory bandwidth" 비(= machine balance)보다 크면 compute-bound, 작으면 memory-bound다.

런타임 관점에서 이게 뜻하는 바는 단순하다. **Prefill에서는 matrix engine이 TOPS를 다 쓴다. Decode에서는 DMA/DRAM이 병목이라 matrix engine이 자주 논다.** 대부분의 NPU backend는 이 두 시나리오를 위해 아예 별개의 커널 스케줄을 artifact에 넣어두고, runtime은 입력 shape에 따라 어느 쪽을 실행할지 고른다.

### Roofline Model — 왜 Decode는 느린가

Roofline model[^6]은 arithmetic intensity에 따라 달성 가능한 성능의 상한선을 보여준다. 왼쪽 기울어진 지붕은 메모리 대역폭, 오른쪽 수평한 지붕은 compute throughput이다.

[^6]: Williams, Waterman, Patterson (2009)의 고전. "이 커널이 왜 느린지"를 판단하는 데 가장 빠른 도구다.

<div class="fig-interactive">
  <div id="fig-roofline" class="fig-plot"></div>
  <div class="fig-controls">
    <div class="fig-control">
      <label>batch / N</label>
      <input type="range" id="rl-N" min="1" max="512" step="1" value="1">
      <span class="fig-val" id="rl-N-val">1</span>
    </div>
    <div class="fig-control">
      <label>weight bits</label>
      <input type="range" id="rl-bits" min="2" max="16" step="1" value="4">
      <span class="fig-val" id="rl-bits-val">4</span>
    </div>
  </div>
  <div class="fig-caption"><strong>Figure 4.</strong> Snapdragon 8 Elite NPU의 roofline (INT8 peak ≈ 45 TOPS, DRAM ≈ 70 GB/s). N=1이면 decode 영역(빨간 점)에 머물며 대역폭 지붕에 막히고, N이 커지면 compute 지붕(파란 점)으로 올라간다. bit 수를 줄이면 점이 오른쪽으로 이동해 intensity가 높아진다.</div>
</div>

이 그림이 주는 교훈은 단순하다. **NPU의 TOPS를 full로 뽑고 싶으면 batch/sequence length를 키우거나, weight bit 수를 줄여야 한다.** 단일 사용자의 decode는 태생적으로 bandwidth-bound이며, 이 한계를 넘는 유일한 방법은 speculative decoding이나 batched serving 같은 **시스템 레벨 트릭**이다. 하드웨어 자체로는 방법이 없다.

## On-chip SRAM 배정은 컴파일러가 미리 풀어둔 퍼즐이다

여기까지 "런타임은 이미 결정된 스케줄을 재생만 한다"고 여러 번 말했다. 그 스케줄은 누가 어떻게 만드는가? graph finalize 단계(`QnnGraph_finalize`, Qualcomm 기준)에서 벌어지는 일이다. 이 단계를 이해하지 않으면 decode tok/s가 왜 그 값인지를 설명할 수 없다.

<div class="fig-interactive">
  <div class="fig-plot" style="text-align:center; padding: 1rem 0;">
    <img src="/blog/posts/assets/on-device-llm-npu-snapdragon/fig5-scratchpad-sched.svg" alt="On-chip SRAM scheduling" style="max-width:100%; height:auto;">
  </div>
  <div class="fig-caption"><strong>Figure 5.</strong> 그래프 finalize에서 일어나는 5단계 스케줄링. 런타임은 이 결과를 그대로 재생할 뿐이다.</div>
</div>

실제 과정은 대략 다음과 같다.

1. **메모리 블록 등록.** allocator에 두 종류의 메모리 풀을 등록한다 — "Plain" (DRAM)과 "TCM" (on-chip SRAM). 각각 크기와 alignment가 다르다.
2. **Pre-scheduler.** 그래프를 **"on-chip SRAM이 한 번에 담을 수 있는 subgraph 단위"로 파티셔닝**한다. 이 과정에서 topological reorder가 발생해, 가능하면 같은 시점에 살아있어야 하는 텐서가 많지 않도록 op 순서를 재배치한다. 결과물은 "runlist"라 불리는 실행 순서 리스트다.
3. **Spill / Fill 삽입.** 파티션을 나눴는데도 중간 텐서가 on-chip에 다 안 들어간다면, 일부 텐서를 DRAM으로 내렸다가(spill) 다시 올리는(fill) op를 자동으로 삽입한다. 이 spill/fill은 전용 임시 버퍼(Qualcomm의 `QNN_HTP_MEM_SHARED_SPILLFILL_BUFFER`)로 향한다.
4. **Op splitting.** 일부 op는 "launch"와 "wait" 두 개의 반쪽으로 쪼개진다. launch는 background 리소스(예: DMA)에 작업을 예약하고 곧바로 돌아오고, 나중에 wait가 완료를 기다린다. 이 덕분에 matrix engine 사이클 사이사이에 DMA가 자연스럽게 끼어든다.
5. **On-chip offset 배정 + 최종 재정렬.** 각 텐서에 on-chip SRAM 내 주소(offset)를 할당한다. **lifetime이 겹치지 않는 텐서는 같은 주소에 오버레이**된다. 이후 dependency와 offset 제약을 모두 지키면서 병렬성을 최대화하도록 op 순서를 한 번 더 재정렬한다.

이 5단계 전체가 모델 배포 때 이미 끝나 있고, 런타임 `execute()`는 그래프를 풀지 않고 **결정된 스케줄을 재생**할 뿐이다. 그래서 런타임 hot path는 놀랄 만큼 "멍청"하고, 그 덕분에 빠르다.

> 하나 더. 여러 모델을 동시에 돌려야 할 때(예: vision backbone + LLM)는 scratchpad를 offset으로 분할해 각 그래프에 할당할 수 있다 (Qualcomm의 `PARALLEL_GRAPH_EXECUTION_CONFIG`). 그러나 LLM 하나가 혼자 돌 때조차 scratchpad는 빠듯하고, 이 knob은 대개 production에선 "LLM에 전부 할당" 하나로 귀결된다.

## Matrix Engine에 데이터 먹이기 — MatMul 타일링

Matrix engine은 한 번에 고정된 크기의 작은 행렬 곱(예: 32×32 또는 64×64)을 한다. 모델의 거대 행렬($d=4096$ 수준)은 이 작은 타일로 쪼개서 순차적으로 먹여야 한다. 이걸 **타일링(tiling)**이라고 한다.

<div class="fig-interactive">
  <div id="fig-tiling" style="display:flex; justify-content:center; padding: 16px;"></div>
  <div class="fig-controls">
    <div class="fig-control">
      <label>tile size</label>
      <input type="range" id="til-size" min="16" max="128" step="16" value="32">
      <span class="fig-val" id="til-size-val">32</span>
    </div>
    <div class="fig-control">
      <label>step</label>
      <input type="range" id="til-step" min="0" max="63" step="1" value="0">
      <span class="fig-val" id="til-step-val">0</span>
    </div>
    <div class="fig-control">
      <label>▶ 자동재생</label>
      <input type="checkbox" id="til-play">
    </div>
  </div>
  <div class="fig-caption"><strong>Figure 6.</strong> 출력 $C = A \cdot B$를 타일 단위로 채워나가는 모습. 현재 타일을 계산하려면 $A$의 한 행 스트라이프와 $B$의 한 열 스트라이프가 on-chip SRAM에 올라와 있어야 한다. K축을 따라 이동하며 부분합을 누적한다.</div>
</div>

타일 하나를 계산하는 의사코드는 이렇게 생겼다.

```text
for m in range(0, M, T_M):               # output rows
  for n in range(0, N, T_N):             # output cols
    C_tile = 0  in scratchpad
    for k in range(0, K, T_K):           # reduction
      A_tile = DMA_load(A[m:m+T_M, k:k+T_K])
      B_tile = DMA_load(B[k:k+T_K, n:n+T_N])
      C_tile += MatrixEngine_matmul(A_tile, B_tile)   // int4 weight 스트림으로 dequant
    DMA_store(C_tile → C[m:m+T_M, n:n+T_N])
```

이 구조는 **double buffering**으로 가려지는 게 핵심이다. Matrix engine이 타일 $k$를 계산하는 동안 DMA는 이미 타일 $k+1$을 scratchpad로 실어 나른다. compute와 data movement가 겹치면 전체 시간은 둘 중 **큰 쪽**에 묶인다.

한 가지 더: 많은 NPU는 텐서를 단순한 row-major(C-order)가 아니라 **hardware-friendly한 블록 레이아웃**으로 저장한다. Qualcomm HTP에서는 이걸 *crouton* layout이라 부르는데, 예를 들어 텐서가 `1×8×8×32` 같은 고정 chunk 단위로 쪼개져 저장되고 chunk 간 순서가 특정 방식으로 정해져 있다. 이 레이아웃 덕분에 matrix engine이 DMA가 실어온 타일을 **re-layout 없이 바로 먹을 수 있다**. 개발자 입장에선 op의 의미(semantic shape)와 상관없이 추상화되어 있어 신경쓸 일이 적지만, 성능을 뽑으려면 런타임이 이 레이아웃으로 데이터를 놓을 수 있도록 input tensor의 `dataFormat`을 맞춰주는 게 중요하다.

### INT4 Weight를 Matrix Engine이 먹는 방식

Matrix engine은 보통 INT4 행렬을 직접 "곱할 수 있는" 유닛이 아니다. 정확히는 **INT4 weight를 스트림으로 받아 내부에서 INT8/INT16 연산 유닛으로 디스패치**한다. 실제 수행 경로는:

1. scratchpad에서 packed INT4 weight 타일을 읽는다 (2개 weight가 1 byte로 패킹됨).
2. 같은 타일의 group-wise scale(FP16 1개당 weight 64개)을 함께 읽는다.
3. on-the-fly로 INT4 → INT8 또는 INT4 → FP16로 풀면서 MAC 한다.
4. 부분합을 INT32 또는 FP16 누적기에 쌓는다.

그 결과 **DRAM → scratchpad 이동량은 INT4 기준으로 4배 줄고**(FP16 대비), MAC은 거의 원래 속도 그대로 돌아간다. 런타임 관점에서 이건 "같은 시간에 layer가 4배 작은 tile만 기다려도 된다"는 뜻이고, decode처럼 대역폭 병목이 심한 상황에서 직접적으로 tok/s를 끌어올린다.

수식으로 적으면, FP16 GEMM의 이상적 대역폭 요구량은

$$
B_{\text{FP16}} = 2 \cdot d^2 \; \text{bytes per forward}
$$

INT4 W + group scale이면

$$
B_{\text{W4}} = \frac{d^2}{2} + \frac{2 \cdot d^2}{g} \; \text{bytes}, \quad g = 64
$$

$d=4096$, $g=64$를 넣으면 $B_{\text{FP16}} \approx 33.5$ MB, $B_{\text{W4}} \approx 8.9$ MB로 **3.8배** 감소한다. 이게 실제 decode tok/s에서 거의 그대로 나타난다.

## Attention을 NPU에 우겨 넣기

Transformer에서 가장 골치 아픈 연산은 attention이다. 수식만 보면 단순하다.

$$
\text{Attn}(Q, K, V) = \text{softmax}\!\left(\frac{Q K^\top}{\sqrt{d_k}}\right) V
$$

런타임 문제는 중간 텐서 $S = QK^\top$와 $P = \text{softmax}(S)$의 크기가 $N^2$로 폭발한다는 것이다. $N=4096$이면 $S$만 해도 FP16으로 32 MB. 8 MB 남짓의 on-chip SRAM에 들어가지 않는다. **이걸 그대로 돌리면 DRAM 왕복이 발생하면서 decode tok/s가 반토막 난다.**

해법은 **FlashAttention 스타일의 블록 타일링 + online softmax**다. $Q$를 행 방향으로, $K, V$를 열 방향으로 블록 단위로 쪼개 놓고, softmax를 **블록 단위로 점진적으로 정규화**하면서 바로 $V$까지 곱해버린다. 중간에 $S$, $P$ 전체를 저장하지 않는다.

<div class="fig-interactive">
  <div id="fig-attn" style="display:flex; justify-content:center; padding: 12px;"></div>
  <div class="fig-controls">
    <div class="fig-control">
      <label>Q block q</label>
      <input type="range" id="at-q" min="0" max="7" step="1" value="0">
      <span class="fig-val" id="at-q-val">0</span>
    </div>
    <div class="fig-control">
      <label>K/V block k</label>
      <input type="range" id="at-k" min="0" max="7" step="1" value="0">
      <span class="fig-val" id="at-k-val">0</span>
    </div>
  </div>
  <div class="fig-caption"><strong>Figure 7.</strong> FlashAttention-style 블록 순회. 현재 활성화된 Q 블록(파랑)과 K/V 블록(주황)에 대해 $q \cdot k^\top$가 계산되고, online softmax가 누적 통계(m, ℓ)를 업데이트한 뒤 바로 $V$ 쪽 곱을 더한다. 전체 $S$는 메모리에 나타나지 않는다.</div>
</div>

Online softmax는 정말 예쁜 트릭이다. softmax를 안정적으로 계산하려면 $\max$를 빼야 하는데([numerical stability](https://en.wikipedia.org/wiki/Softmax_function#Numerical_stability)), 블록 단위로 돌 땐 아직 전체 $\max$를 모른다. 그래서 현재까지 본 최대값 $m$과 정규화 합 $\ell$을 **scratchpad 안의 state로 유지**하다가, 새 블록이 들어와 최대값이 갱신되면 기존 누적값을 그에 맞춰 스케일링한다[^7].

[^7]: Milakov & Gimelshein (2018)이 "Online normalizer calculation for softmax"에서 정리한 방법이다. FlashAttention이 이걸 attention과 합쳐서 GPU memory를 줄이는 데 써먹었고, NPU에서는 똑같은 아이디어를 on-chip SRAM 제약 하에서 쓴다.

$$
m^{\text{new}} = \max(m^{\text{old}}, \max_j s_j), \quad \ell^{\text{new}} = e^{m^{\text{old}} - m^{\text{new}}} \cdot \ell^{\text{old}} + \sum_j e^{s_j - m^{\text{new}}}
$$

런타임 관점에서 이건 완벽한 **fusion 기회**다. Q/K/V tile load, QK^T (matrix engine), online softmax update (vector engine), ×V (matrix engine), accumulate — 이 모든 단계를 **on-chip SRAM에서 벗어나지 않고** 단일 커널 파이프라인으로 실행한다.

<div class="fig-interactive">
  <div class="fig-plot" style="text-align:center; padding: 1rem 0;">
    <img src="/blog/posts/assets/on-device-llm-npu-snapdragon/fig4-fusion.svg" alt="Operator Fusion" style="max-width:100%; height:auto;">
  </div>
  <div class="fig-caption"><strong>Figure 8.</strong> Fusion 전후 비교. fusion 전에는 매 op마다 DRAM 왕복이 발생하지만, fused kernel은 중간 텐서를 scratchpad에만 놓고 최종 결과만 DRAM로 flush한다. compiled artifact 안에는 이런 "attention-like" 서브그래프가 이미 단일 커널로 합쳐져 있다.</div>
</div>

## KV Cache — 런타임 동안 계속 부풀어 오른다

Decode 루프를 돌리다 보면, 새로 생성한 토큰의 K, V를 매번 다시 계산하지 않기 위해 **KV cache**라는 이름의 과거 history를 저장해둔다. 토큰 하나당 크기는

$$
\text{bytes per token} = 2 \; \text{(K, V)} \times n_{\text{layers}} \times n_{\text{heads}} \times d_{\text{head}} \times \text{dtype size}
$$

Llama-3 8B ($n_{\text{layers}}=32$, $n_{\text{heads}}=8$ with GQA[^8], $d_{\text{head}}=128$)이면 FP16으로 토큰당 **128 KB**. 8K 컨텍스트면 **1 GB**가 통째로 KV cache다. 모바일 기기에서는 그냥 못 넘기는 숫자다. 그래서 배포된 그래프 안에서 KV는 거의 항상 **INT8** (또는 INT4)로 다뤄진다[^9].

[^8]: Grouped Query Attention. query head는 여러 개지만 K, V head는 몇 개(예: 32 → 8)로 줄여서 KV cache를 4배 줄인다. Llama-3, Mistral, Qwen 등 최근 LLM은 거의 다 GQA를 쓴다. NPU 배포 입장에서는 이 구조가 없으면 사실상 게임이 안 된다.

[^9]: 런타임에서 KV cache에 새 K,V를 append할 때는 vector engine이 per-token 또는 per-group quantize를 수행하고, attention 계산 시에는 matrix engine이 INT8 → FP16 dequant 후 곱한다. 품질 손실은 attention score가 최종적으로 softmax를 통과하기 때문에 weight 양자화보다 훨씬 관대하다 — 경험적으로 INT8 KV cache는 perplexity가 0.3% 이내로 증가하는 수준이다.

<div class="fig-interactive">
  <div id="fig-kv" class="fig-plot"></div>
  <div class="fig-controls">
    <div class="fig-control">
      <label>context 길이</label>
      <input type="range" id="kv-len" min="256" max="16384" step="256" value="4096">
      <span class="fig-val" id="kv-len-val">4096</span>
    </div>
    <div class="fig-control">
      <label>dtype (KV)</label>
      <input type="range" id="kv-bits" min="4" max="16" step="4" value="8">
      <span class="fig-val" id="kv-bits-val">8</span>
    </div>
    <div class="fig-control">
      <label>GQA ratio</label>
      <input type="range" id="kv-gqa" min="1" max="8" step="1" value="4">
      <span class="fig-val" id="kv-gqa-val">4</span>
    </div>
  </div>
  <div class="fig-caption"><strong>Figure 9.</strong> 컨텍스트 길이에 따른 KV cache 크기. GQA ratio(Q heads / KV heads)를 키울수록, KV bit 수를 줄일수록, 사용량은 급격히 감소한다. 붉은 점선은 6GB RAM 스마트폰에서 KV에 할당할 수 있는 현실적 상한(약 1.5 GB).</div>
</div>

KV cache는 물리적으로 **DRAM의 공유 메모리 영역**에 놓이고, decode 때마다 필요한 부분만 DMA로 scratchpad에 실어 온다. 구체적으로는 Qualcomm의 HTP backend 기준, KV 전체는 "여러 텐서가 offset으로 공존하는 하나의 shared buffer"에 앉혀두는 것이 전형적이다. runtime 스케줄러는 attention 블록 타일링에 맞춰 **필요한 K/V window만 streaming**해서 가져온다 — 전체 KV를 한 번에 읽으면 bandwidth 낭비고, 애초에 on-chip에 들어가지도 않는다.

Weight 쪽도 비슷한 구조를 쓰지만 성격이 다르다. Weight는 decode 루프 내내 **바뀌지 않는다**. 그래서 각 execute 호출마다 re-register 하는 건 낭비다. HTP backend에는 **persistent weights buffer**라는 전용 memory type이 있어서, 한 번 등록된 weight는 여러 execute 호출 사이에 맵핑이 유지된다. LLM처럼 weight 수 GB가 상수인 경우 이게 없으면 decode tok/s가 수십 % 날아간다.

## 런타임 메모리 예산

실전에서 엔지니어가 가장 먼저 계산하는 건 메모리다. Snapdragon 8 Elite 폰 (12 GB RAM, 앱에 할당 가능한 것은 대략 6~8 GB)에서 Llama-3.1 8B를 돌린다고 가정하자.

$$
M_{\text{total}} = M_{\text{weights}} + M_{\text{KV}} + M_{\text{act}} + M_{\text{sys}}
$$

- $M_{\text{weights}}$ (W4, persistent weights buffer): $8 \times 10^9 \times 0.5 \approx 4.0$ GB
- $M_{\text{KV}}$ (INT8, GQA 4:1, ctx 4K): $2 \cdot 32 \cdot 8 \cdot 128 \cdot 4096 \approx 256$ MB
- $M_{\text{act}}$ (layer-scoped FP16): $\approx 100$ MB
- $M_{\text{sys}}$ (OS, tokenizer, UI, …): $\approx 1.5$ GB

총합이 약 **5.9 GB**. 빡빡하긴 해도 12 GB 폰에서는 현실적이다. 만약 14B 모델로 올라가면 weights만 7 GB가 되어 금방 한계에 부딪히고, 여기서부터는 weight를 **메모리-맵드**로 올려 필요한 층만 DRAM에 reside 시키는 **layer-wise streaming**이 필요해진다.

## 한 번의 Decode 스텝 — 논리 vs 실제 API

지금까지 배운 모든 요소가 어떻게 한 줄씩 실행되는지 보자. 먼저 Transformer 관점의 **논리적** 의사코드 (Llama-3 아키텍처 기준):

```python
# ---------- Host CPU (app) ----------
token_id = sample(prev_logits)              # top-p sampling
input_ids[pos] = token_id
pos += 1
# bind input/output buffers (shared memory)
Graph_execute(graph, [token_id, kv_cache, pos], [logits])

# ---------- NPU (inside graph) ----------
x = embed[token_id]                         # [1, d]  — DRAM lookup

for layer in range(n_layers):
    # ----- RMSNorm (vector engine) -----
    x_norm = rms_norm(x, w_norm)            # elementwise, fits scratchpad

    # ----- Q, K, V projection (matrix engine, fused) -----
    # INT4 weights, FP16 activation, matrix engine dequantizes on the fly
    q, k, v = fused_qkv_proj(x_norm, W_qkv) # [1, h*d_h], GQA splits inside

    # ----- RoPE (vector engine, in-place) -----
    q = rope(q, cos_cache[pos], sin_cache[pos])
    k = rope(k, cos_cache[pos], sin_cache[pos])

    # ----- KV cache append (vector engine quantize + DMA to DRAM) -----
    kv_cache[layer, pos] = quantize_int8(k, v)

    # ----- Attention (fused Flash-style kernel) -----
    # Q: [1, d_h]   K/V: stream from DRAM → scratchpad in blocks
    o = flash_attention(q, kv_cache[layer, :pos+1])

    # ----- Output projection (matrix engine) -----
    x = x + o_proj(o)                       # residual

    # ----- MLP: RMSNorm → SwiGLU → down_proj -----
    x_norm2 = rms_norm(x, w_norm2)
    gate = silu(gate_proj(x_norm2)) * up_proj(x_norm2)  # matrix + vector fused
    x = x + down_proj(gate)

# ----- Final norm + LM head (matrix engine) -----
x = rms_norm(x, w_final)
logits = lm_head(x)                         # [1, vocab]  — DRAM store

# ---------- Return ----------
# NPU signals "done" → runtime returns → app reads logits → sample next token
```

코드로 보면 "그냥 Transformer 아닌가?" 싶지만, 각 줄 뒤에는 타일 크기 결정, double buffering, INT4 unpack, online softmax, group-wise scale lookup, on-chip offset 배정이 모두 숨어있다. 그리고 이 모든 것은 **컴파일된 artifact 안에 이미 박힌 스케줄**을 재생하는 것뿐이다.

실제 **벤더 런타임 C API 관점**에서 같은 한 스텝은 훨씬 짧은 코드로 줄어든다. Qualcomm QNN을 예로 들면 대략 이렇게 생겼다.

```c
// ---- 앱 초기화 시 한 번만 (persistent) ----
QnnBackend_create(logHandle, backendConfig, &backend);
QnnDevice_create(logHandle, deviceConfig, &device);
QnnContext_createFromBinary(backend, device, ctxConfig,
                            binaryBlob, binarySize,
                            &context, /*profile=*/NULL);
QnnContext_retrieveGraph(context, "llama_decode", &graph);

// weights 공유 메모리 등록 (여러 execute 호출 사이에 persist)
Qnn_MemDescriptor_t weightsDesc = { .memType  = QNN_MEM_TYPE_ION,
                                    /* 또는 QNN_HTP_MEM_WEIGHTS_BUFFER */
                                    .memHandle = /* fd/ptr */ ... };
QnnMem_register(context, &weightsDesc, 1, &weightsMem);

// KV cache도 shared buffer로 등록
QnnMem_register(context, &kvDesc, 1, &kvMem);

// ---- decode 루프: token당 한 번씩 ----
while (!eos) {
    token_id = sample(prev_logits);

    inputs[0].memHandle  = tokenIdMem;
    inputs[1].memHandle  = kvMem;           // KV는 한 번 register, 계속 append
    outputs[0].memHandle = logitMem;

    QnnGraph_execute(graph, inputs, nIn, outputs, nOut,
                     /*profile=*/NULL, /*signal=*/NULL);
    // ↑ 이 한 줄 안에서 Figure 2의 ①~⑦이 전부 일어난다.
}
```

Hot loop은 `QnnGraph_execute` 하나뿐이다. 그 외에는 앱 쪽 sampling 뿐. 런타임 hot path가 왜 그렇게 얇은지, 왜 벤더들이 context binary 같은 무거운 artifact를 미리 만들어두는지가 이 코드에서 그대로 드러난다.

## 성능 숫자 — 현실은 어떤가

정리하면서 2025~2026년 Snapdragon 8 Elite 기기에서 관측되는 대략의 숫자를 적는다. 공식 발표와 다수 리뷰를 종합한 범위다.

| 모델 | weight 포맷 | TTFT (512 tok prompt) | Decode tok/s |
|---|---|---|---|
| Llama-3.2 3B | W4 | 0.3~0.5 s | 45~60 |
| Llama-3.1 8B | W4 | 0.9~1.3 s | 22~32 |
| Qwen-2.5 14B | W4 | 2.0~2.8 s | 10~14 |

TTFT(Time-To-First-Token)는 prefill 시간 + 첫 번째 decode 시간이다. 숫자가 선형처럼 보이지만 실제로는 thermal, 메모리 대역폭 경쟁, background workload에 따라 ±20% 정도 흔들린다. 특히 **연속 생성 후 10~20초부터 thermal throttling으로 decode tok/s가 70% 수준으로 떨어지는 것**은 거의 모든 모바일 NPU의 공통적인 한계다. 런타임 레벨에서는 이를 일부 보정하려고 DVFS 힌트를 조정하거나 matrix engine 상한을 낮추는 정도의 대응이 가능하지만, 궁극적으로는 칩 표면온도가 지배한다.

## 마무리 — 그리고 남은 방향들

이 글에서 보여준 건 결국 **"이미 고정된 그래프를 NPU 하드웨어에 가장 덜 놀게 흘려보내는 싸움"**이다. `execute()` 한 번이 IPC로 가속기에 도착하고, on-NPU 스케줄러가 layer를 순차 실행하고, matrix/vector engine이 scratchpad 안에서 연산하고, DMA가 DRAM과 scratchpad 사이를 쉼 없이 오가는 것 — 그 모든 단계가 "matrix engine이 쉬지 않게" 라는 단 하나의 원칙으로 정렬되어 있다.

벤더마다 이름은 다르다 (Qualcomm의 HMX/HVX/VTCM, Apple의 ANE, Google의 MXU+Unified Buffer, Samsung/MediaTek의 MAC array + TCM). 하지만 싸우는 방식은 거의 동일하고, 이 글에서 본 스택 구조와 런타임 흐름은 대부분의 NPU에서 거의 그대로 성립한다.

앞으로 흥미로워질 방향은 몇 가지가 있다.

- **Speculative decoding** — 작은 draft 모델이 여러 토큰을 미리 예측하고, 본체 모델이 batch로 검증하는 방식. Decode를 batch-like 하게 만들어 Roofline 지붕을 올려친다.
- **MoE on NPU** — expert routing을 어떻게 scratchpad에 올릴지가 핵심 난제다. sparse한 메모리 접근 패턴은 NPU 입장에서는 악몽이다.
- **4-bit activation** — W4A4. 품질은 아직 넘기 힘들지만 성공하면 decode 속도가 또 한 번 점프한다.
- **On-device fine-tuning** — 여러 벤더가 공식적으로 밀고 있는 방향. decode만큼의 대역폭으로 LoRA update를 돌리는 아이디어다.

하드웨어는 5년 주기로 한 세대가 바뀌는데, 위 싸움의 전반적인 틀은 당분간 바뀌지 않을 것으로 보인다. 그 틀 안에서 얼마나 영리하게 on-chip SRAM을 채워넣느냐가, 결국 당신 주머니 안의 LLM이 얼마나 빨리 대답하느냐를 결정한다.

---

*궁금한 점이나 오류가 있다면 [crinexk@gmail.com](mailto:crinexk@gmail.com)로 알려주시면 감사합니다.*

<script>
(function() {
  function waitForPlotly(cb) {
    if (typeof Plotly !== 'undefined') return cb();
    setTimeout(function() { waitForPlotly(cb); }, 100);
  }

  waitForPlotly(function() {
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    var bg = isDark ? '#1e1e28' : '#ffffff';
    var grid = isDark ? '#2a2a34' : '#f0f0f0';
    var line = isDark ? '#333' : '#ddd';
    var label = isDark ? '#888' : '#666';
    var blue = '#3a6ea5', red = '#c44e52', teal = '#3a9e8f', gold = '#c9a227';

    var baseLayout = {
      paper_bgcolor: bg, plot_bgcolor: bg,
      font: { color: label, family: 'Inter, Pretendard, sans-serif', size: 12 },
      margin: { l: 52, r: 16, t: 10, b: 44 },
      xaxis: { gridcolor: grid, zerolinecolor: line, linecolor: line },
      yaxis: { gridcolor: grid, zerolinecolor: line, linecolor: line },
    };
    var cfg = { responsive: true, displayModeBar: false };

    function linspace(a, b, n){var r=[];for(var i=0;i<n;i++)r.push(a+(b-a)*i/(n-1));return r;}

    // ===== Fig 4: Roofline model =====
    function drawRoofline() {
      var N = parseInt(document.getElementById('rl-N').value);
      var bits = parseInt(document.getElementById('rl-bits').value);
      document.getElementById('rl-N-val').textContent = N;
      document.getElementById('rl-bits-val').textContent = bits;

      var PEAK_TOPS = 45e12;  // 45 TOPS (INT8 nominal)
      var BW = 70e9;          // 70 GB/s
      var intensity = 16 * N / bits;

      var xs = [];
      for (var e = -1; e <= 5; e += 0.1) xs.push(Math.pow(10, e));
      var ceil = xs.map(function(x){ return Math.min(PEAK_TOPS, x * BW) / 1e12; });

      var perf = Math.min(PEAK_TOPS, intensity * BW) / 1e12;
      var color = intensity * BW < PEAK_TOPS ? red : blue;
      var regime = intensity * BW < PEAK_TOPS ? 'memory-bound' : 'compute-bound';

      Plotly.react('fig-roofline', [
        { x: xs, y: ceil, mode: 'lines', name: 'NPU roofline',
          line: { color: '#2f4e77', width: 2.5 } },
        { x: [intensity], y: [perf], mode: 'markers+text', name: 'N=' + N + ', W' + bits,
          marker: { color: color, size: 14, line: { color: '#ffffff', width: 2 } },
          text: ['  ' + regime + '\n  ' + perf.toFixed(1) + ' TOPS'],
          textposition: 'top right', textfont: { size: 11, color: color } },
      ], Object.assign({}, baseLayout, {
        xaxis: Object.assign({}, baseLayout.xaxis, {
          type: 'log', title: { text: 'Arithmetic Intensity (FLOP / byte)', font:{size:11} },
          range: [-1, 5],
        }),
        yaxis: Object.assign({}, baseLayout.yaxis, {
          type: 'log', title: { text: 'Performance (TOPS)', font:{size:11} },
          range: [-1, Math.log10(PEAK_TOPS/1e12) + 0.3],
        }),
        showlegend: true, legend: { x: 0.02, y: 0.98, bgcolor: 'rgba(0,0,0,0)', font:{size:11} }
      }), cfg);
    }
    document.getElementById('rl-N').addEventListener('input', drawRoofline);
    document.getElementById('rl-bits').addEventListener('input', drawRoofline);
    drawRoofline();

    // ===== Fig 6: MatMul Tiling visualization =====
    (function(){
      var wrap = document.getElementById('fig-tiling');
      wrap.innerHTML =
        '<div style="text-align:center;margin:0 8px;">'+
        '<div style="font-size:11px;color:#6a7a8e;margin-bottom:4px;">A (activations / output rows)</div>'+
        '<canvas id="til-A" width="150" height="220" style="border:1px solid #e0e0e0;border-radius:6px;"></canvas></div>'+
        '<div style="font-size:18px;color:#8a98ad;align-self:center;margin:0 4px;">×</div>'+
        '<div style="text-align:center;margin:0 8px;">'+
        '<div style="font-size:11px;color:#6a7a8e;margin-bottom:4px;">B (weights)</div>'+
        '<canvas id="til-B" width="220" height="220" style="border:1px solid #e0e0e0;border-radius:6px;"></canvas></div>'+
        '<div style="font-size:18px;color:#8a98ad;align-self:center;margin:0 4px;">=</div>'+
        '<div style="text-align:center;margin:0 8px;">'+
        '<div style="font-size:11px;color:#6a7a8e;margin-bottom:4px;">C (output, filled tile-by-tile)</div>'+
        '<canvas id="til-C" width="220" height="220" style="border:1px solid #e0e0e0;border-radius:6px;"></canvas></div>';

      var playHandle = null;

      function drawTiling() {
        var T = parseInt(document.getElementById('til-size').value);
        var step = parseInt(document.getElementById('til-step').value);
        document.getElementById('til-size-val').textContent = T;
        document.getElementById('til-step-val').textContent = step;

        var M = 256, N = 256, K = 256;
        var nTM = Math.ceil(M / T), nTN = Math.ceil(N / T), nTK = Math.ceil(K / T);
        var totalSteps = nTM * nTN * nTK;
        var cur = Math.min(step, totalSteps - 1);
        document.getElementById('til-step').max = totalSteps - 1;

        var m = Math.floor(cur / (nTN * nTK));
        var rem = cur % (nTN * nTK);
        var n = Math.floor(rem / nTK);
        var k = rem % nTK;

        (function(){
          var c = document.getElementById('til-A'), ctx = c.getContext('2d');
          var W = 150, H = 220;
          ctx.clearRect(0,0,W,H); ctx.fillStyle = '#fafbfc'; ctx.fillRect(0,0,W,H);
          ctx.strokeStyle = '#e8edf3'; ctx.lineWidth = 1;
          for (var i = 0; i <= nTK; i++){ var x = W*i/nTK; ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
          for (var j = 0; j <= nTM; j++){ var y = H*j/nTM; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
          ctx.fillStyle = 'rgba(58,110,165,0.15)';
          ctx.fillRect(0, H*m/nTM, W, H/nTM);
          ctx.fillStyle = '#3a6ea5';
          ctx.fillRect(W*k/nTK, H*m/nTM, W/nTK, H/nTM);
        })();

        (function(){
          var c = document.getElementById('til-B'), ctx = c.getContext('2d');
          var W = 220, H = 220;
          ctx.clearRect(0,0,W,H); ctx.fillStyle = '#fafbfc'; ctx.fillRect(0,0,W,H);
          ctx.strokeStyle = '#e8edf3';
          for (var i = 0; i <= nTN; i++){ var x = W*i/nTN; ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
          for (var j = 0; j <= nTK; j++){ var y = H*j/nTK; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
          ctx.fillStyle = 'rgba(201,162,39,0.2)';
          ctx.fillRect(W*n/nTN, 0, W/nTN, H);
          ctx.fillStyle = '#c9a227';
          ctx.fillRect(W*n/nTN, H*k/nTK, W/nTN, H/nTK);
        })();

        (function(){
          var c = document.getElementById('til-C'), ctx = c.getContext('2d');
          var W = 220, H = 220;
          ctx.clearRect(0,0,W,H); ctx.fillStyle = '#fafbfc'; ctx.fillRect(0,0,W,H);
          ctx.strokeStyle = '#e8edf3';
          for (var i = 0; i <= nTN; i++){ var x = W*i/nTN; ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
          for (var j = 0; j <= nTM; j++){ var y = H*j/nTM; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

          for (var mi = 0; mi < nTM; mi++) for (var ni = 0; ni < nTN; ni++) {
            var linearIdx = mi * nTN * nTK + ni * nTK + (nTK - 1);
            if (linearIdx < cur) {
              ctx.fillStyle = 'rgba(58,110,165,0.45)';
              ctx.fillRect(W*ni/nTN, H*mi/nTM, W/nTN, H/nTM);
            }
          }
          ctx.fillStyle = 'rgba(201,78,82,0.75)';
          ctx.fillRect(W*n/nTN, H*m/nTM, W/nTN, H/nTM);
          ctx.strokeStyle = '#c44e52'; ctx.lineWidth = 2;
          ctx.strokeRect(W*n/nTN+1, H*m/nTM+1, W/nTN-2, H/nTM-2);

          ctx.fillStyle = '#4a5b73'; ctx.font = '10px sans-serif';
          ctx.fillText('tile (m='+m+', n='+n+', k='+k+')', 6, H - 6);
        })();
      }

      document.getElementById('til-size').addEventListener('input', drawTiling);
      document.getElementById('til-step').addEventListener('input', drawTiling);
      document.getElementById('til-play').addEventListener('change', function(e){
        if (e.target.checked) {
          playHandle = setInterval(function(){
            var s = parseInt(document.getElementById('til-step').value);
            var max = parseInt(document.getElementById('til-step').max);
            document.getElementById('til-step').value = (s + 1) % (max + 1);
            drawTiling();
          }, 180);
        } else {
          if (playHandle) { clearInterval(playHandle); playHandle = null; }
        }
      });
      drawTiling();
    })();

    // ===== Fig 7: FlashAttention block visualization =====
    (function(){
      var wrap = document.getElementById('fig-attn');
      wrap.innerHTML =
        '<div style="display:flex; gap:12px; align-items:flex-start;">'+
          '<div style="text-align:center;">'+
            '<div style="font-size:11px;color:#6a7a8e;margin-bottom:4px;">QK<sup>⊤</sup> score matrix (N×N)</div>'+
            '<canvas id="attn-S" width="280" height="280" style="border:1px solid #e0e0e0;border-radius:6px;"></canvas>'+
            '<div style="font-size:10px;color:#8a98ad;margin-top:4px;">파랑 = 현재 Q 행 블록 · 주황 = 현재 K 열 블록 · 겹침 = 활성 연산</div>'+
          '</div>'+
          '<div style="font-size:11px;color:#6a7a8e;max-width:240px;line-height:1.6;padding-top:28px;">'+
            '<strong>Online softmax state (scratchpad에만 존재):</strong><br>'+
            '<span style="font-family:monospace;font-size:11px;">m_i</span>: 지금까지의 row-max<br>'+
            '<span style="font-family:monospace;font-size:11px;">ℓ_i</span>: 지금까지의 exp 합<br>'+
            '<span style="font-family:monospace;font-size:11px;">O_i</span>: 부분 output (아직 정규화 X)<br><br>'+
            '새 K 블록이 들어올 때마다 m_i를 갱신하고, O_i를 재스케일한 뒤 V와 곱한 값을 누적.<br><br>'+
            '<em style="color:#3a6ea5;">N × N 행렬을 한 번도 물질화하지 않는다.</em>'+
          '</div>'+
        '</div>';

      function drawAttn(){
        var q = parseInt(document.getElementById('at-q').value);
        var k = parseInt(document.getElementById('at-k').value);
        document.getElementById('at-q-val').textContent = q;
        document.getElementById('at-k-val').textContent = k;
        var c = document.getElementById('attn-S'), ctx = c.getContext('2d');
        var SZ = 280, B = 8;
        ctx.clearRect(0,0,SZ,SZ);
        var cell = SZ / B;
        for (var i = 0; i < B; i++) for (var j = 0; j < B; j++) {
          if (j > i) ctx.fillStyle = '#f0f2f6';
          else ctx.fillStyle = '#e8eef5';
          ctx.fillRect(j*cell, i*cell, cell, cell);
        }
        ctx.fillStyle = 'rgba(58,110,165,0.30)';
        ctx.fillRect(0, q*cell, SZ, cell);
        ctx.fillStyle = 'rgba(201,162,39,0.30)';
        ctx.fillRect(k*cell, 0, cell, SZ);
        ctx.fillStyle = (k <= q) ? '#c44e52' : '#bbb';
        ctx.fillRect(k*cell, q*cell, cell, cell);
        ctx.strokeStyle = '#cbd4e2'; ctx.lineWidth = 1;
        for (var i = 0; i <= B; i++){ ctx.beginPath(); ctx.moveTo(0, i*cell); ctx.lineTo(SZ, i*cell); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(i*cell, 0); ctx.lineTo(i*cell, SZ); ctx.stroke(); }
        ctx.fillStyle = '#8a98ad'; ctx.font = '10px sans-serif';
        ctx.fillText('causal (j≤i)', 8, SZ - 8);
        if (k > q) {
          ctx.fillStyle = '#c44e52'; ctx.font = 'bold 10px sans-serif';
          ctx.fillText('masked out', k*cell + 2, q*cell + 14);
        } else {
          ctx.fillStyle = '#ffffff'; ctx.font = 'bold 10px sans-serif';
          ctx.fillText('active', k*cell + 8, q*cell + 18);
        }
      }
      document.getElementById('at-q').addEventListener('input', drawAttn);
      document.getElementById('at-k').addEventListener('input', drawAttn);
      drawAttn();
    })();

    // ===== Fig 9: KV cache size =====
    function drawKV() {
      var ctx = parseInt(document.getElementById('kv-len').value);
      var bits = parseInt(document.getElementById('kv-bits').value);
      var gqa = parseInt(document.getElementById('kv-gqa').value);
      document.getElementById('kv-len-val').textContent = ctx;
      document.getElementById('kv-bits-val').textContent = bits;
      document.getElementById('kv-gqa-val').textContent = gqa + ':1';

      var n_layers = 32, n_q_heads = 32, d_head = 128;
      var n_kv_heads = n_q_heads / gqa;

      var lens = [];
      for (var L = 256; L <= 16384; L += 256) lens.push(L);

      function compute(L, b) {
        return 2 * n_layers * n_kv_heads * d_head * L * (b/8) / (1024*1024*1024);
      }

      var yCur = lens.map(function(L){ return compute(L, bits); });
      var yFp16 = lens.map(function(L){ return compute(L, 16); });

      var curVal = compute(ctx, bits);

      Plotly.react('fig-kv', [
        { x: lens, y: yFp16, mode: 'lines', name: 'FP16 (no quant)',
          line: { color: '#bbb', width: 1.5, dash: 'dot' } },
        { x: lens, y: yCur, mode: 'lines', name: 'INT' + bits + ' (GQA ' + gqa + ':1)',
          line: { color: blue, width: 2.5 }, fill: 'tozeroy', fillcolor: 'rgba(58,110,165,0.1)' },
        { x: [ctx], y: [curVal], mode: 'markers+text', name: 'current',
          marker: { color: red, size: 11, line: { color: '#fff', width: 2 } },
          text: ['  ' + curVal.toFixed(2) + ' GB'], textposition: 'top right',
          textfont: { color: red, size: 11 }, showlegend: false },
        { x: [256, 16384], y: [1.5, 1.5], mode: 'lines', name: 'mobile KV budget',
          line: { color: red, width: 1, dash: 'dash' } },
      ], Object.assign({}, baseLayout, {
        xaxis: Object.assign({}, baseLayout.xaxis, { title: { text: 'Context length (tokens)', font:{size:11} } }),
        yaxis: Object.assign({}, baseLayout.yaxis, { title: { text: 'KV cache size (GB)', font:{size:11} }, range: [0, 3.2] }),
        showlegend: true, legend: { x: 0.02, y: 0.98, bgcolor: 'rgba(0,0,0,0)', font:{size:11} }
      }), cfg);
    }
    document.getElementById('kv-len').addEventListener('input', drawKV);
    document.getElementById('kv-bits').addEventListener('input', drawKV);
    document.getElementById('kv-gqa').addEventListener('input', drawKV);
    drawKV();
  });
})();
</script>
