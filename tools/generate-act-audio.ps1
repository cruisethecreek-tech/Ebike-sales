Add-Type -AssemblyName System.Speech

$acts = @(
  @{
    file = "voice-act0.wav"
    text = "December in Northeast Ohio. The trails go quiet. The snow falls... and holiday shoppers face an agonizing question."
  },
  @{
    file = "voice-act1.wav"
    text = "Why buy an e-bike for Christmas when it just sits in a freezing garage until April? Five months of factory warranty... ticking away into nothing."
  },
  @{
    file = "voice-act2.wav"
    text = "This year, we changed the rules. Introducing the Cruise the Creek Holiday Certificate. Give the thrill under the tree... with zero lost time."
  },
  @{
    file = "voice-act3.wav"
    text = "With our exclusive Spring-Start Guarantee, your factory warranty is frozen in time. The clock does not tick until your spring delivery date. One hundred percent of your coverage, intact."
  },
  @{
    file = "voice-act4.wav"
    text = "Every certificate includes our full professional Creek Ready assembly and safety inspection. Heated indoor storage, battery care, and zero guesswork on frame size or color."
  },
  @{
    file = "voice-act5.wav"
    text = "Give the gift of the ride this holiday. The adventure starts in spring. Reserve your certificate today at Cruise the Creek."
  }
)

$outDir = "c:\Users\pattr\Documents\ebikesales\Ebike-sales\media"

foreach ($act in $acts) {
  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $synth.SelectVoice("Microsoft David Desktop")
  $synth.Rate = 0 # Normal, natural trailer cadence
  $targetPath = Join-Path $outDir $act.file
  $synth.SetOutputToWaveFile($targetPath)
  $synth.Speak($act.text)
  $synth.Dispose()
}
