resource "nomad_job" "seaweedfs-csi" {
  jobspec          = file("${path.module}/job.nomad.hcl")
  purge_on_destroy = true
  detach           = false
  rerun_if_dead    = true
}
